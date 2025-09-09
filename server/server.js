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
    'https://aipoweredsemanticsearchapp.eu-contentstackapps.com',
    'https://ai-powered-semantic-search-app-frontend-5v69zz3yt.vercel.app',
    'https://ai-powered-semantic-search-app-fron.vercel.app'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));




// Helper functions for image extraction and analysis
function extractImageUrls(entry) {
  const images = [];
  
  // Common image field names including your specific field names
  const imageFields = [
    'image', 'featured_image', 'banner_image', 'thumbnail', 'photo', 'picture', 'media',
    'product_image', 'media_file', 'asset', 'file'
  ];
  
  // Debug: Log what we find in each field
  imageFields.forEach(field => {
    if (entry.hasOwnProperty(field)) {
      console.log(`      DEBUG: Field '${field}' exists with value:`, JSON.stringify(entry[field], null, 2));
      
      if (entry[field]) {
        if (typeof entry[field] === 'string' && entry[field].includes('contentstack.io')) {
          console.log(`      DEBUG: Found direct URL in ${field}: ${entry[field]}`);
          images.push(ensureHttpsUrl(entry[field]));
        } else if (entry[field].url) {
          console.log(`      DEBUG: Found URL property in ${field}: ${entry[field].url}`);
          // Only include if it's an image file, not PDF or other documents
          if (isImageUrl(entry[field].url)) {
            images.push(ensureHttpsUrl(entry[field].url));
          }
        } else if (typeof entry[field] === 'object') {
          console.log(`      DEBUG: ${field} is an object, checking for nested URLs...`);
          // Check for nested URL structures
          if (entry[field].href && isImageUrl(entry[field].href)) {
            console.log(`      DEBUG: Found href in ${field}: ${entry[field].href}`);
            images.push(ensureHttpsUrl(entry[field].href));
          }
        }
      } else {
        console.log(`      DEBUG: Field '${field}' is null or empty`);
      }
    }
  });

  // Handle image arrays
  if (entry.images && Array.isArray(entry.images)) {
    entry.images.forEach(img => {
      if (typeof img === 'string' && img.includes('contentstack.io') && isImageUrl(img)) {
        images.push(ensureHttpsUrl(img));
      } else if (img && img.url && isImageUrl(img.url)) {
        images.push(ensureHttpsUrl(img.url));
      }
    });
  }

  // Handle gallery or media arrays
  if (entry.gallery && Array.isArray(entry.gallery)) {
    entry.gallery.forEach(item => {
      if (item && item.url && isImageUrl(item.url)) {
        images.push(ensureHttpsUrl(item.url));
      }
    });
  }

  return [...new Set(images)]; // Remove duplicates
}



// Helper function to check if URL is an image
function isImageUrl(url) {
  if (!url) return false;
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const urlLower = url.toLowerCase();
  return imageExtensions.some(ext => urlLower.includes(ext)) || 
         urlLower.includes('/images/') || 
         urlLower.includes('image');
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

// WEBHOOK AUTHENTICATION MIDDLEWARE
const authenticateWebhook = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    console.log('❌ Webhook authentication failed: No basic auth header');
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    // Use the same credentials you set in Contentstack webhook configuration
    const expectedUsername = process.env.WEBHOOK_USERNAME || 'contentstack_webhook';
    const expectedPassword = process.env.WEBHOOK_PASSWORD || 'your-secure-password';

    if (username !== expectedUsername || password !== expectedPassword) {
      console.log('❌ Webhook authentication failed: Invalid credentials');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('✅ Webhook authentication successful');
    next();
  } catch (error) {
    console.log('❌ Webhook authentication error:', error.message);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// HELPER FUNCTIONS FOR CONTENT EXTRACTION
function extractContentFromEntry(entryData, contentType) {
  let content = '';
  
  // Extract title
  if (entryData.title) {
    content += entryData.title + ' ';
  }
  
  // Extract description/summary
  if (entryData.description) {
    content += entryData.description + ' ';
  }
  if (entryData.summary) {
    content += entryData.summary + ' ';
  }
  
  // Extract rich text content
  if (entryData.content) {
    if (typeof entryData.content === 'string') {
      content += entryData.content + ' ';
    } else if (entryData.content.children) {
      // Handle rich text editor content
      content += extractRichTextContent(entryData.content) + ' ';
    }
  }
  
  // Extract body content
  if (entryData.body) {
    if (typeof entryData.body === 'string') {
      content += entryData.body + ' ';
    } else if (entryData.body.children) {
      content += extractRichTextContent(entryData.body) + ' ';
    }
  }
  
  // Extract tags
  if (entryData.tags && Array.isArray(entryData.tags)) {
    content += entryData.tags.join(' ') + ' ';
  }
  
  // Extract category
  if (entryData.category) {
    content += entryData.category + ' ';
  }
  
  return content.trim();
}

function extractRichTextContent(richTextObj) {
  if (!richTextObj || !richTextObj.children) return '';
  
  let text = '';
  
  function traverse(node) {
    if (node.text) {
      text += node.text + ' ';
    }
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverse);
    }
  }
  
  richTextObj.children.forEach(traverse);
  return text.trim();
}

// WEBHOOK HANDLER FUNCTIONS
async function handleEntryPublish(entryData, contentType, locale, index) {
  console.log(`📤 Publishing entry: ${entryData.uid}`);
  await reindexEntry(entryData, contentType, locale, index);
}

async function handleEntryUpdate(entryData, contentType, locale, index) {
  console.log(`📝 Updating entry: ${entryData.uid}`);
  await reindexEntry(entryData, contentType, locale, index);
}

async function handleEntryUnpublish(entryUid, contentType, locale, index) {
  console.log(`📥 Unpublishing entry: ${entryUid}`);
  await removeFromIndex(entryUid, contentType, locale, index);
}

async function handleEntryDelete(entryUid, contentType, locale, index) {
  console.log(`🗑️ Deleting entry: ${entryUid}`);
  await removeFromIndex(entryUid, contentType, locale, index);
}

// Enhanced reindex function
async function reindexEntry(entryData, contentType, locale, index) {
  try {
    // Extract content for embedding
    const content = extractContentFromEntry(entryData, contentType);
    
    if (!content || content.trim().length === 0) {
      console.log(`⚠️ No content to index for entry ${entryData.uid}`);
      return;
    }

    console.log(`🤖 Generating embedding for: ${entryData.title || entryData.uid}`);

    // Generate embedding using Cohere
    const embedResponse = await cohere.embed({
      model: "embed-english-light-v3.0",
      texts: [content.trim()],
      inputType: "search_document"
    });

    let embedding;
    if (embedResponse?.embeddings?.[0]) {
      embedding = embedResponse.embeddings[0];
    } else if (embedResponse?.body?.embeddings?.[0]) {
      embedding = embedResponse.body.embeddings[0];
    } else {
      throw new Error("Failed to get embeddings from Cohere");
    }

    // Extract images
    const images = extractImageUrls(entryData);
    
    // Prepare metadata
    const metadata = {
      id: entryData.uid,
      type: contentType,
      content_type_uid: contentType,
      title: entryData.title || entryData.name || 'Untitled',
      snippet: content.substring(0, 300) + (content.length > 300 ? '...' : ''),
      locale: locale,
      date: entryData.updated_at || entryData.created_at || new Date().toISOString(),
      updated_at: entryData.updated_at || new Date().toISOString(),
      url: entryData.url || `#${entryData.uid}`,
      tags: Array.isArray(entryData.tags) ? entryData.tags : 
            (typeof entryData.tags === 'string' ? entryData.tags.split(',').map(t => t.trim()) : []),
      category: entryData.category || contentType
    };

    // Add image metadata if images exist
    if (images.length > 0) {
      metadata.primary_image = images[0];
      metadata.all_images = images;
      metadata.image_count = images.length;
      metadata.has_images = true;
    }

    // Add additional fields that might be useful for search
    if (entryData.price) metadata.price = entryData.price;
    if (entryData.duration) metadata.duration = entryData.duration;
    if (entryData.author) metadata.author = entryData.author;

    // Update in Pinecone
    const vectorId = `${entryData.uid}_${locale}`;
    await index.upsert([{
      id: vectorId,
      values: embedding,
      metadata: metadata
    }]);

    console.log(`✅ Successfully reindexed entry: ${entryData.uid} (${vectorId})`);
  } catch (error) {
    console.error(`❌ Failed to reindex entry ${entryData.uid}:`, error);
    throw error;
  }
}

// Helper function to remove entry from index
async function removeFromIndex(entryUid, contentType, locale, index) {
  try {
    // Remove specific locale version
    const vectorId = `${entryUid}_${locale}`;
    await index.deleteOne(vectorId);
    
    console.log(`✅ Successfully removed entry from index: ${vectorId}`);
  } catch (error) {
    console.error(`❌ Failed to remove entry ${entryUid} from index:`, error);
    throw error;
  }
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
      multimodal_search: true,
      webhook_integration: true
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

// ===========================================
// WEBHOOK ENDPOINTS - NEW INTEGRATION
// ===========================================


// Webhook handler for Contentstack content changes

app.post('/api/webhook/contentstack', authenticateWebhook, async (req, res) => {
  try {
    console.log('🔔 Received Contentstack webhook:', JSON.stringify(req.body, null, 2));
    
    const { event, data, module } = req.body;
    
    if (!event || !data) {
      console.log('❌ Invalid webhook payload - missing event or data');
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Handle different webhook payload structures
    let entryData, contentType, entryUid, locale;

    if (module === 'entry' && data.entry) {
      // Standard entry webhook
      entryData = data.entry;
      contentType = entryData.content_type_uid;
      entryUid = entryData.uid;
      locale = entryData.locale || 'en-us';
    } else if (module === 'asset' && data.asset) {
      // Asset webhook - log and acknowledge but don't process
      console.log(`📷 Asset event: ${event} for asset ${data.asset.uid}`);
      return res.status(200).json({ 
        success: true, 
        message: 'Asset webhook received but not processed',
        event,
        assetUid: data.asset.uid
      });
    } else if (data.uid && data.content_type_uid) {
      // Direct entry data
      entryData = data;
      contentType = data.content_type_uid;
      entryUid = data.uid;
      locale = data.locale || 'en-us';
    } else if (data.uid && !data.content_type_uid) {
      // Could be asset data without content_type_uid
      console.log(`📷 Possible asset event: ${event} for ${data.uid}`);
      return res.status(200).json({ 
        success: true, 
        message: 'Asset-like webhook received but not processed',
        event,
        uid: data.uid
      });
    } else {
      console.log('❌ Unsupported webhook payload structure:', { event, dataKeys: Object.keys(data), module });
      return res.status(400).json({ 
        error: 'Unsupported payload structure',
        received: { event, module, dataKeys: Object.keys(data) }
      });
    }

    console.log(`📝 Processing webhook: ${event} for ${contentType}:${entryUid} (${locale})`);

    const index = pinecone.Index(process.env.PINECONE_INDEX);

    switch (event) {
      case 'entry.publish':
      case 'publish':
        await handleEntryPublish(entryData, contentType, locale, index);
        break;
        
      case 'entry.update':
      case 'update':
        await handleEntryUpdate(entryData, contentType, locale, index);
        break;
        
      case 'entry.unpublish':
      case 'unpublish':
        await handleEntryUnpublish(entryUid, contentType, locale, index);
        break;
        
      case 'entry.delete':
      case 'delete':
        await handleEntryDelete(entryUid, contentType, locale, index);
        break;

      // Asset events - acknowledge but don't process
      case 'asset.publish':
      case 'asset.update':
      case 'asset.unpublish':
      case 'asset.delete':
        console.log(`📷 Asset event handled: ${event}`);
        break;
        
      default:
        console.log(`⚠️ Unhandled webhook event: ${event}`);
    }

    res.status(200).json({ 
      success: true, 
      message: 'Webhook processed successfully',
      event,
      entryUid: entryUid || 'asset',
      contentType: contentType || 'asset',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ 
      error: 'Webhook processing failed', 
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});




// Webhook test endpoint
app.get('/api/webhook/test', (req, res) => {
  res.json({
    status: 'Webhook endpoint is active',
    timestamp: new Date().toISOString(),
    authentication: 'Basic Auth required',
    supportedEvents: [
      'entry.publish',
      'entry.update', 
      'entry.unpublish',
      'entry.delete'
    ]
  });
});

// Manual reindex endpoint for specific entries
app.post('/api/reindex/:contentType/:entryUid', authenticateWebhook, async (req, res) => {
  try {
    const { contentType, entryUid } = req.params;
    const { locale = 'en-us' } = req.body;

    console.log(`🔄 Manual reindex requested for ${contentType}:${entryUid}`);

    // Fetch entry from Contentstack
    const entry = await Stack.ContentType(contentType).Entry(entryUid).toJSON().fetch();
    
    if (!entry) {
      return res.status(404).json({
        error: 'Entry not found',
        contentType,
        entryUid
      });
    }

    const index = pinecone.Index(process.env.PINECONE_INDEX);
    await reindexEntry(entry, contentType, locale, index);

    res.json({
      success: true,
      message: 'Entry reindexed successfully',
      entryUid,
      contentType,
      locale,
      title: entry.title || 'Untitled'
    });

  } catch (error) {
    console.error('❌ Manual reindex error:', error);
    res.status(500).json({
      error: 'Manual reindex failed',
      details: error.message
    });
  }
});

// Bulk reindex endpoint for content type
app.post('/api/reindex-content-type/:contentType', authenticateWebhook, async (req, res) => {
  try {
    const { contentType } = req.params;
    const { locale = 'en-us', limit = 100 } = req.body;

    console.log(`🔄 Bulk reindex requested for content type: ${contentType}`);

    // Fetch entries from Contentstack
    const query = Stack.ContentType(contentType).Query().limit(limit);
    const result = await query.toJSON().find();
    
    let entries = [];
    if (result && Array.isArray(result)) {
      entries = Array.isArray(result[0]) ? result[0] : result;
    } else if (result && result.entries) {
      entries = result.entries;
    }

    if (entries.length === 0) {
      return res.status(404).json({
        error: 'No entries found',
        contentType
      });
    }

    const index = pinecone.Index(process.env.PINECONE_INDEX);
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const entry of entries) {
      try {
        await reindexEntry(entry, contentType, locale, index);
        successCount++;
        console.log(`✅ Reindexed: ${entry.uid}`);
      } catch (error) {
        errorCount++;
        errors.push({
          uid: entry.uid,
          error: error.message
        });
        console.error(`❌ Failed to reindex ${entry.uid}:`, error.message);
      }
    }

    res.json({
      success: true,
      message: 'Bulk reindex completed',
      contentType,
      locale,
      totalEntries: entries.length,
      successCount,
      errorCount,
      errors: errors.slice(0, 10) // Limit error details
    });

  } catch (error) {
    console.error('❌ Bulk reindex error:', error);
    res.status(500).json({
      error: 'Bulk reindex failed',
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
    console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/api/webhook/contentstack`);
    console.log(`🔄 Manual reindex endpoint: http://localhost:${PORT}/api/reindex/:contentType/:entryUid`);
    console.log(`🌍 Contentstack region: ${process.env.CONTENTSTACK_REGION || 'US'}`);
    console.log(`🤖 Features enabled:`);
    console.log(`   - Semantic search: ✅`);
    console.log(`   - Image analysis: ${openai ? '✅ (with gpt-4o-mini)' : '❌ (OpenAI API key not configured)'}`);
    console.log(`   - Multimodal search: ✅`);
    console.log(`   - Debug endpoints: ✅`);
    console.log(`   - Webhook integration: ✅`);
    console.log(`   - Real-time sync: ✅`);
  });
}