import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone";
import { CohereClient } from "cohere-ai";
import OpenAI from "openai";
import contentstack from "contentstack";

dotenv.config();

// Validate environment variables
const requiredEnvVars = [
  'COHERE_API_KEY',
  'PINECONE_API_KEY',
  'PINECONE_INDEX',
  'PINECONE_ENVIRONMENT'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize clients
const cohere = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

// Initialize Pinecone with version compatibility
let pinecone;
try {
  // Try new SDK format first
  pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });
} catch (error) {
  // Try old SDK format
  pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
    environment: process.env.PINECONE_ENVIRONMENT,
  });
}

// Initialize OpenAI only if API key is provided
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Helper function to get the correct Contentstack region
const getContentstackRegion = () => {
  const region = process.env.CONTENTSTACK_REGION;
  switch(region) {
    case 'EU': return contentstack.Region.EU;
    case 'AZURE_NA': return contentstack.Region.AZURE_NA;
    case 'AZURE_EU': return contentstack.Region.AZURE_EU;
    case 'US':
    default: return contentstack.Region.US;
  }
};

// Initialize Contentstack
const Stack = contentstack.Stack({
  api_key: process.env.CONTENTSTACK_API_KEY,
  delivery_token: process.env.CONTENTSTACK_DELIVERY_TOKEN,
  environment: process.env.CONTENTSTACK_ENVIRONMENT,
  region: getContentstackRegion()
});

const app = express();

// Middleware - Updated CORS for Vercel
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'http://localhost:3000', 
    'http://127.0.0.1:5173',
    // Add your production domains here when needed
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Helper functions for image extraction and analysis
function extractImageUrls(entry) {
  const images = [];
  
  // Common image field names
  const imageFields = ['image', 'featured_image', 'banner_image', 'thumbnail', 'photo', 'picture', 'media'];
  
  imageFields.forEach(field => {
    if (entry[field]) {
      if (typeof entry[field] === 'string' && entry[field].includes('contentstack.io')) {
        images.push(ensureHttpsUrl(entry[field]));
      } else if (entry[field].url) {
        images.push(ensureHttpsUrl(entry[field].url));
      }
    }
  });

  // Handle image arrays
  if (entry.images && Array.isArray(entry.images)) {
    entry.images.forEach(img => {
      if (typeof img === 'string' && img.includes('contentstack.io')) {
        images.push(ensureHttpsUrl(img));
      } else if (img && img.url) {
        images.push(ensureHttpsUrl(img.url));
      }
    });
  }

  // Handle gallery or media arrays
  if (entry.gallery && Array.isArray(entry.gallery)) {
    entry.gallery.forEach(item => {
      if (item && item.url) {
        images.push(ensureHttpsUrl(item.url));
      }
    });
  }

  return [...new Set(images)]; // Remove duplicates
}

function ensureHttpsUrl(url) {
  if (!url) return null;
  if (url.startsWith('http://')) {
    return url.replace('http://', 'https://');
  }
  if (url.startsWith('//')) {
    return `https:${url}`;
  }
  return url;
}

function analyzeImageFields(entry) {
  const analysis = {};
  const allFields = Object.keys(entry).filter(key => !key.startsWith('_'));
  
  allFields.forEach(fieldName => {
    const value = entry[fieldName];
    
    if (value && typeof value === 'object') {
      // Check if it looks like a Contentstack asset
      if (value.url || value.href || value.filename) {
        analysis[fieldName] = {
          type: 'potential_asset',
          hasUrl: !!value.url,
          hasHref: !!value.href,
          hasFilename: !!value.filename,
          structure: Object.keys(value)
        };
      }
    }
    
    if (Array.isArray(value)) {
      const hasAssets = value.some(item => 
        item && typeof item === 'object' && (item.url || item.href || item.filename)
      );
      
      if (hasAssets) {
        analysis[fieldName] = {
          type: 'asset_array',
          length: value.length,
          sampleStructure: value.length > 0 ? Object.keys(value[0] || {}) : []
        };
      }
    }
    
    if (typeof value === 'string' && value.includes('contentstack.io')) {
      analysis[fieldName] = {
        type: 'direct_url',
        url: value
      };
    }
  });
  
  return analysis;
}

// Helper function to detect visual search queries
function isVisualQuery(query) {
  const visualKeywords = [
    // Colors
    'red', 'blue', 'green', 'yellow', 'black', 'white', 'brown', 'pink', 'purple', 'orange', 'gray', 'grey',
    'silver', 'gold', 'navy', 'maroon', 'crimson', 'scarlet', 'burgundy',
    // Visual descriptors
    'color', 'colored', 'bright', 'dark', 'light',
    'stripe', 'striped', 'pattern', 'design', 'logo', 'symbol',
    'round', 'square', 'circular', 'rectangular',
    'texture', 'material', 'fabric', 'leather', 'metal',
    // Objects
    'shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots',
    'container', 'bottle', 'packaging', 'box',
    'clothing', 'shirt', 'dress', 'pants', 'jacket',
    'appearance', 'look', 'style', 'visual'
  ];
  
  const queryLower = query.toLowerCase();
  const matchedKeywords = visualKeywords.filter(keyword => queryLower.includes(keyword));
  
  return {
    isVisual: matchedKeywords.length > 0,
    confidence: Math.min(matchedKeywords.length / 3, 1),
    matchedKeywords
  };
}

// Helper function to extract image information from results
function processImageData(results) {
  let multimodalResultsCount = 0;
  let analyzedImageCount = 0;
  let totalImagesFound = 0;

  results.forEach(result => {
    // Check for primary image
    if (result.metadata?.primary_image || result.metadata?.primaryImage) {
      result.hasImages = true;
      result.primaryImage = result.metadata.primary_image || result.metadata.primaryImage;
      multimodalResultsCount++;
      totalImagesFound++;
    }

    // Check for all images
    if (result.metadata?.all_images || result.metadata?.allImages) {
      const allImages = result.metadata.all_images || result.metadata.allImages;
      if (Array.isArray(allImages) && allImages.length > 0) {
        result.allImages = allImages;
        result.imageCount = allImages.length;
        totalImagesFound += allImages.length;
        
        if (!result.hasImages) {
          result.hasImages = true;
          result.primaryImage = allImages[0];
          multimodalResultsCount++;
        }
      }
    }

    // Check for image analysis data
    if (result.metadata?.image_analysis || result.metadata?.imageAnalysis) {
      result.imageAnalyzed = true;
      analyzedImageCount++;
    }

    // Check for visual query match
    if (result.metadata?.visual_match || result.metadata?.visualMatch) {
      result.visualQueryMatch = true;
    }
  });

  return {
    multimodalResultsCount,
    analyzedImageCount,
    totalImagesFound,
    hasMultimodalResults: multimodalResultsCount > 0
  };
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    region: process.env.CONTENTSTACK_REGION || 'US',
    features: {
      semantic_search: true,
      image_analysis: !!openai,
      multimodal_search: true
    }
  });
});

// Debug endpoint for Contentstack data inspection
app.get('/debug-contentstack/:contentType/:entryId?', async (req, res) => {
  try {
    const { contentType, entryId } = req.params;
    
    if (entryId) {
      // Fetch specific entry
      const entry = await Stack.ContentType(contentType).Entry(entryId).toJSON().fetch();
      res.json({
        status: 'success',
        contentType,
        entryId,
        entry: entry,
        extractedImages: extractImageUrls(entry),
        allFields: Object.keys(entry).filter(key => !key.startsWith('_')),
        imageFieldAnalysis: analyzeImageFields(entry)
      });
    } else {
      // Fetch first few entries
      const query = Stack.ContentType(contentType).Query().limit(3);
      const result = await query.toJSON().find();
      
      let entries = [];
      if (result && Array.isArray(result)) {
        entries = Array.isArray(result[0]) ? result[0] : result;
      } else if (result && result.entries) {
        entries = result.entries;
      }
      
      const analysis = entries.map(entry => ({
        uid: entry.uid,
        title: entry.title,
        extractedImages: extractImageUrls(entry),
        allFields: Object.keys(entry).filter(key => !key.startsWith('_')),
        imageFieldAnalysis: analyzeImageFields(entry)
      }));
      
      res.json({
        status: 'success',
        contentType,
        totalEntries: entries.length,
        analysis
      });
    }
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({
      error: 'Debug failed',
      details: error.message
    });
  }
});

// Enhanced Semantic Search Endpoint with Image Analysis
app.post("/search", async (req, res) => {
  console.log('🔍 Search request received:', req.body);
  
  try {
    const { query, contentTypes = [], locales = [] } = req.body;
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ 
        error: "Query is required and must be a non-empty string",
        received: { query, type: typeof query }
      });
    }

    console.log(`📝 Processing query: "${query}"`);
    console.log(`🎯 Content types filter: ${contentTypes}`);
    console.log(`🌍 Locales filter: ${locales}`);

    // Detect if this is a visual query
    const visualAnalysis = isVisualQuery(query);
    console.log(`👁️ Visual query analysis:`, visualAnalysis);

    // Generate embedding for query using Cohere
    console.log('🤖 Generating embeddings with Cohere...');
    const embedResponse = await cohere.embed({
      model: "embed-english-light-v3.0",
      texts: [query.trim()],
      inputType: "search_query"
    });

    let queryVector;
    
    // Handle different response structures
    if (embedResponse?.embeddings?.[0]) {
      queryVector = embedResponse.embeddings[0];
    } else if (embedResponse?.body?.embeddings?.[0]) {
      queryVector = embedResponse.body.embeddings[0];
    } else {
      console.error('❌ Cohere embedding response:', embedResponse);
      throw new Error("Failed to get embeddings from Cohere");
    }

    if (!Array.isArray(queryVector) || queryVector.length === 0) {
      throw new Error("Invalid vector format from Cohere");
    }

    console.log(`✅ Generated vector with dimension: ${queryVector.length}`);

    // Query Pinecone index
    console.log('🔍 Querying Pinecone index...');
    const index = pinecone.Index(process.env.PINECONE_INDEX);
    
    const queryOptions = {
      vector: queryVector,
      topK: 20,
      includeMetadata: true,
    };

    // Add filtering if specified
    if (contentTypes.length > 0 || locales.length > 0) {
      queryOptions.filter = {};
      
      if (contentTypes.length > 0) {
        queryOptions.filter.type = { "$in": contentTypes };
      }
      
      if (locales.length > 0) {
        queryOptions.filter.locale = { "$in": locales };
      }
    }

    console.log('📊 Query options:', JSON.stringify(queryOptions, null, 2));

    const searchResult = await index.query(queryOptions);
    
    console.log(`🎯 Pinecone returned ${searchResult.matches?.length || 0} matches`);

    // Process and return results
    const results = (searchResult.matches || []).map((item, index) => {
      const metadata = item.metadata || {};
      
      return {
        id: item.id,
        title: metadata.title || `Result ${index + 1}`,
        type: metadata.type || 'unknown',
        contentType: metadata.type || 'unknown',
        snippet: metadata.snippet || metadata.description || 'No description available',
        locale: metadata.locale || 'en-us',
        tags: Array.isArray(metadata.tags) ? metadata.tags : 
              (typeof metadata.tags === 'string' ? metadata.tags.split(',').map(t => t.trim()) : []),
        similarity: Math.min(Math.max(item.score || 0, 0), 1),
        relevance: Math.min(Math.max(item.score || 0, 0), 1),
        date: metadata.date || metadata.updated_at || new Date().toISOString().split('T')[0],
        lastModified: metadata.date || metadata.updated_at || new Date().toISOString().split('T')[0],
        url: metadata.url || '',
        contentTypeUid: metadata.content_type_uid || metadata.type,
        originalScore: item.score,
        
        // Image-related fields
        primary_image: metadata.primary_image,
        primaryImage: metadata.primary_image,
        all_images: metadata.all_images,
        allImages: metadata.all_images,
        image_analysis: metadata.image_analysis,
        imageAnalysis: metadata.image_analysis,
        visual_match: metadata.visual_match,
        visualMatch: metadata.visual_match,
        
        // Additional metadata
        category: metadata.category,
        price: metadata.price,
        duration: metadata.duration
      };
    });

    // Sort results by relevance
    const sortedResults = results.sort((a, b) => b.relevance - a.relevance);

    // Process image data and get statistics
    const imageStats = processImageData(sortedResults);

    // Create search context
    const searchContext = {
      isVisualQuery: visualAnalysis.isVisual,
      visualConfidence: visualAnalysis.confidence,
      matchedVisualKeywords: visualAnalysis.matchedKeywords,
      ...imageStats
    };

    console.log(`✅ Returning ${sortedResults.length} processed results`);
    console.log(`📊 Image statistics:`, imageStats);
    
    // Log final processed scores
    if (sortedResults.length > 0) {
      console.log('🏆 Final sorted scores (first 5):');
      sortedResults.slice(0, 5).forEach((result, idx) => {
        console.log(`   ${idx + 1}. ${result.title}: ${(result.relevance * 100).toFixed(1)}% (orig: ${result.originalScore?.toFixed(4)})`);
      });
    }

    res.json({ 
      results: sortedResults,
      query,
      totalResults: sortedResults.length,
      searchTime: Date.now(),
      searchContext,
      filters: {
        contentTypes: contentTypes.length > 0 ? contentTypes : 'all',
        locales: locales.length > 0 ? locales : 'all'
      }
    });

  } catch (error) {
    console.error('❌ Search error:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Search failed';
    let statusCode = 500;
    
    if (error.message.includes('Cohere')) {
      errorMessage = 'Failed to generate embeddings. Please check your Cohere API key.';
      statusCode = 503;
    } else if (error.message.includes('Pinecone')) {
      errorMessage = 'Failed to search vector database. Please check your Pinecone configuration.';
      statusCode = 503;
    } else if (error.message.includes('Index')) {
      errorMessage = 'Vector database index not found. Please check your Pinecone index name.';
      statusCode = 404;
    }

    res.status(statusCode).json({ 
      error: errorMessage,
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Image analysis endpoint with updated model
app.post("/analyze-image", async (req, res) => {
  if (!openai) {
    return res.status(503).json({
      error: "Image analysis not available. OpenAI API key not configured."
    });
  }

  try {
    const { imageUrl, query } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ error: "Image URL is required" });
    }

    console.log(`🖼️ Analyzing image: ${imageUrl}`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Updated to current model
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: query ? 
                `Analyze this image in the context of the search query: "${query}". Describe what you see and how it relates to the query.` :
                "Describe what you see in this image in detail, focusing on colors, objects, text, patterns, and visual elements."
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: 300
    });

    const analysis = response.choices[0]?.message?.content || "Unable to analyze image";

    res.json({
      analysis,
      imageUrl,
      query: query || null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Image analysis error:', error);
    res.status(500).json({
      error: "Image analysis failed",
      details: error.message
    });
  }
});

// Test endpoint to check if any data exists in Pinecone
app.get('/test-data', async (req, res) => {
  try {
    const index = pinecone.Index(process.env.PINECONE_INDEX);
    const stats = await index.describeIndexStats();
    
    res.json({
      status: 'success',
      indexStats: stats,
      hasData: stats.totalVectorCount > 0
    });
  } catch (error) {
    console.error('❌ Test data error:', error);
    res.status(500).json({
      error: 'Failed to check index stats',
      details: error.message
    });
  }
});

// Debug endpoint to see sample vectors in the index
app.get('/debug-vectors', async (req, res) => {
  try {
    const index = pinecone.Index(process.env.PINECONE_INDEX);
    
    // Query with a zero vector to get any results (for debugging)
    const debugQuery = await index.query({
      vector: new Array(384).fill(0), // 384-dimension embeddings for Cohere light model
      topK: 10,
      includeMetadata: true,
    });
    
    const debugResults = debugQuery.matches?.map(match => ({
      id: match.id,
      title: match.metadata?.title,
      type: match.metadata?.type,
      score: match.score,
      hasImages: !!(match.metadata?.primary_image || match.metadata?.all_images)
    })) || [];
    
    res.json({
      status: 'success',
      sampleVectors: debugResults,
      totalFound: debugResults.length
    });
    
  } catch (error) {
    console.error('❌ Debug vectors error:', error);
    res.status(500).json({
      error: 'Failed to debug vectors',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Export the app for Vercel
export default app;


// Add this to your backend/server.js or create as separate file and import

// Webhook handler for Contentstack content changes
app.post('/api/webhook/contentstack', async (req, res) => {
  try {
    console.log('Received Contentstack webhook:', req.body);
    
    const { event, data } = req.body;
    
    if (!event || !data) {
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    const entryData = data.entry || data;
    const contentType = entryData.content_type_uid || entryData.content_type;
    const entryUid = entryData.uid;
    const locale = entryData.locale || 'en-us';

    console.log(`Webhook event: ${event} for content type: ${contentType}, entry: ${entryUid}`);

    switch (event) {
      case 'entry.publish':
      case 'entry.update':
        // Re-index the updated entry
        await reindexEntry(entryData, contentType, locale);
        break;
        
      case 'entry.unpublish':
      case 'entry.delete':
        // Remove from index
        await removeFromIndex(entryUid, contentType);
        break;
        
      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    res.status(200).json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed', details: error.message });
  }
});

// Helper function to reindex a single entry
async function reindexEntry(entryData, contentType, locale) {
  try {
    // Extract content for embedding
    const content = extractContentFromEntry(entryData, contentType);
    
    if (!content || content.trim().length === 0) {
      console.log(`No content to index for entry ${entryData.uid}`);
      return;
    }

    // Generate embedding
    const embedding = await generateEmbedding(content);
    
    // Prepare metadata
    const metadata = {
      id: entryData.uid,
      contentType: contentType,
      title: entryData.title || entryData.name || 'Untitled',
      locale: locale,
      lastModified: new Date().toISOString(),
      snippet: content.substring(0, 300),
      url: entryData.url || `#${entryData.uid}`,
      // Add any other relevant metadata
      tags: entryData.tags || [],
      category: entryData.category || contentType
    };

    // Handle images if present
    if (entryData.images || entryData.image || entryData.featured_image) {
      const images = extractImages(entryData);
      if (images.length > 0) {
        metadata.primaryImage = images[0];
        metadata.allImages = images;
        metadata.imageCount = images.length;
        metadata.hasImages = true;
      }
    }

    // Update in Pinecone
    const vectorId = `${entryData.uid}_${locale}`;
    await index.upsert([{
      id: vectorId,
      values: embedding,
      metadata: metadata
    }]);

    console.log(`Successfully reindexed entry: ${entryData.uid}`);
  } catch (error) {
    console.error(`Failed to reindex entry ${entryData.uid}:`, error);
    throw error;
  }
}

// Helper function to remove entry from index
async function removeFromIndex(entryUid, contentType) {
  try {
    // Remove all locales of this entry
    const vectorIds = [`${entryUid}_en-us`, `${entryUid}_es-es`, `${entryUid}_fr-fr`, `${entryUid}_de-de`];
    
    await index.deleteMany(vectorIds);
    console.log(`Successfully removed entry from index: ${entryUid}`);
  } catch (error) {
    console.error(`Failed to remove entry ${entryUid} from index:`, error);
    throw error;
  }
}

// Helper function to extract images from entry
function extractImages(entry) {
  const images = [];
  
  // Check various possible image fields
  const imageFields = ['images', 'image', 'featured_image', 'banner_image', 'gallery'];
  
  imageFields.forEach(field => {
    if (entry[field]) {
      if (Array.isArray(entry[field])) {
        entry[field].forEach(img => {
          if (img.url) images.push(img.url);
          if (img.href) images.push(img.href);
        });
      } else if (typeof entry[field] === 'object' && entry[field].url) {
        images.push(entry[field].url);
      } else if (typeof entry[field] === 'string') {
        images.push(entry[field]);
      }
    }
  });

  return images.filter(url => url && url.trim().length > 0);
}

// Add webhook verification middleware (optional but recommended)
app.use('/api/webhook/contentstack', (req, res, next) => {
  // Verify webhook signature if Contentstack provides one
  // This is optional but recommended for security
  const signature = req.headers['x-contentstack-signature'];
  
  if (signature) {
    // Implement signature verification here
    // const expectedSignature = generateSignature(req.body, webhookSecret);
    // if (signature !== expectedSignature) {
    //   return res.status(401).json({ error: 'Invalid webhook signature' });
    // }
  }
  
  next();
});

// Only listen on port in development/local
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check available at: http://localhost:${PORT}/health`);
    console.log(`🔍 Search endpoint: http://localhost:${PORT}/search`);
    console.log(`🖼️ Image analysis endpoint: http://localhost:${PORT}/analyze-image`);
    console.log(`🧪 Test data endpoint: http://localhost:${PORT}/test-data`);
    console.log(`🐛 Debug vectors endpoint: http://localhost:${PORT}/debug-vectors`);
    console.log(`🔧 Debug Contentstack endpoint: http://localhost:${PORT}/debug-contentstack/:contentType`);
    console.log(`🌍 Contentstack region: ${process.env.CONTENTSTACK_REGION || 'US'}`);
    console.log(`🤖 Features enabled:`);
    console.log(`   - Semantic search: ✅`);
    console.log(`   - Image analysis: ${openai ? '✅ (with gpt-4o-mini)' : '❌ (OpenAI API key not configured)'}`);
    console.log(`   - Multimodal search: ✅`);
    console.log(`   - Debug endpoints: ✅`);
  });
}