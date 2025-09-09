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
    console.error(`Missing required environment variable: ${envVar}`);
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

// HELPER FUNCTIONS - MOVED TO GLOBAL SCOPE

// Force image URLs to use https
function ensureHttpsUrl(url) {
  if (!url) return null;
  try {
    let u = new URL(url, "https://dummy-base.com"); // handles relative
    if (u.protocol !== "https:") {
      u.protocol = "https:";
    }
    return u.toString();
  } catch {
    return url;
  }
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

// New function to map content types to display names
function mapContentTypeToDisplay(contentTypeUid) {
  const mappings = {
    'article': 'article',
    'blog_post': 'article',
    'news': 'article',
    'post': 'article',
    'content': 'article',
    'page': 'article',
    'product': 'product',
    'item': 'product',
    'goods': 'product',
    'smartphone': 'product',
    'electronics': 'product',
    'watch': 'product',
    'media': 'media',
    'image': 'media',
    'asset': 'media',
    'video': 'video',
    'movie': 'video',
    'film': 'video'
  };
  
  // Try exact match first
  if (mappings[contentTypeUid]) {
    return mappings[contentTypeUid];
  }
  
  // Try partial matches
  const lowerUid = contentTypeUid.toLowerCase();
  for (const [key, value] of Object.entries(mappings)) {
    if (lowerUid.includes(key)) {
      return value;
    }
  }
  
  // Default fallback based on common patterns
  if (lowerUid.includes('product') || lowerUid.includes('item') || lowerUid.includes('goods')) {
    return 'product';
  }
  if (lowerUid.includes('video') || lowerUid.includes('movie') || lowerUid.includes('film')) {
    return 'video';
  }
  if (lowerUid.includes('media') || lowerUid.includes('image') || lowerUid.includes('photo')) {
    return 'media';
  }
  
  // Default fallback
  return 'article';
}

// New function for AI image analysis
async function analyzeImageWithAI(imageUrl, title = '', query = '') {
  if (!openai) {
    console.log('OpenAI not available for image analysis');
    return null;
  }

  try {
    console.log(`Analyzing image: ${imageUrl.substring(0, 100)}...`);
    
    const analysisPrompt = query 
      ? `Analyze this image for a content item titled "${title}" in the context of the search query "${query}". Describe the key visual elements including colors, objects, text, patterns, and overall composition. Focus on details that would be useful for search and discovery.`
      : `Analyze this image for a content item titled "${title}". Describe the key visual elements including colors, objects, text, patterns, and overall composition. Focus on details that would be useful for search and discovery.`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: analysisPrompt
            },
            {
              type: "image_url",
              image_url: {
                url: ensureHttpsUrl(imageUrl)
              }
            }
          ]
        }
      ],
      max_tokens: 300
    });

    const analysis = response.choices[0]?.message?.content;
    
    if (analysis) {
      console.log(`Image analysis completed: ${analysis.substring(0, 100)}...`);
      return analysis;
    }
    
    return null;
  } catch (error) {
    console.error(`Image analysis failed for ${imageUrl}:`, error.message);
    return null;
  }
}

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
    console.log('Webhook authentication failed: No basic auth header');
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    // Use the same credentials you set in Contentstack webhook configuration
    const expectedUsername = process.env.WEBHOOK_USERNAME || 'contentstack_webhook';
    const expectedPassword = process.env.WEBHOOK_PASSWORD || 'your-secure-password';

    if (username !== expectedUsername || password !== expectedPassword) {
      console.log('Webhook authentication failed: Invalid credentials');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('Webhook authentication successful');
    next();
  } catch (error) {
    console.log('Webhook authentication error:', error.message);
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
  console.log(`Publishing entry: ${entryData.uid}`);
  await reindexEntry(entryData, contentType, locale, index);
}

async function handleEntryUpdate(entryData, contentType, locale, index) {
  console.log(`Updating entry: ${entryData.uid}`);
  await reindexEntry(entryData, contentType, locale, index);
}

async function handleEntryUnpublish(entryUid, contentType, locale, index) {
  console.log(`Unpublishing entry: ${entryUid}`);
  await removeFromIndex(entryUid, contentType, locale, index);
}

async function handleEntryDelete(entryUid, contentType, locale, index) {
  console.log(`Deleting entry: ${entryUid}`);
  await removeFromIndex(entryUid, contentType, locale, index);
}

// Enhanced reindex function with proper image analysis
async function reindexEntry(entryData, contentType, locale, index) {
  try {
    // Extract content for embedding
    const content = extractContentFromEntry(entryData, contentType);
    
    if (!content || content.trim().length === 0) {
      console.log(`No content to index for entry ${entryData.uid}`);
      return;
    }

    console.log(`Generating embedding for: ${entryData.title || entryData.uid}`);

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

    // Extract images with enhanced logging
    const images = extractImageUrls(entryData);
    console.log(`Found ${images.length} images for entry ${entryData.uid}`);
    if (images.length > 0) {
      console.log(`   Image URLs:`, images);
    }
    
    // Prepare metadata with proper content type mapping
    const mappedType = mapContentTypeToDisplay(contentType);
    console.log(`Mapping content type ${contentType} to ${mappedType}`);
    
    const metadata = {
      id: entryData.uid,
      type: mappedType, // Use the mapped type
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

    // Add enhanced image metadata and analysis
    if (images.length > 0) {
      metadata.primary_image = images[0];
      metadata.all_images = images;
      metadata.image_count = images.length;
      metadata.has_images = true;
      
      // Perform AI image analysis if OpenAI is available
      if (openai && images[0]) {
        try {
          console.log(`Performing AI image analysis for entry ${entryData.uid}`);
          const imageAnalysis = await analyzeImageWithAI(images[0], entryData.title || 'content');
          
          if (imageAnalysis) {
            metadata.image_analysis = imageAnalysis;
            metadata.image_analyzed = true;
            console.log(`AI analysis completed for ${entryData.uid}: ${imageAnalysis.substring(0, 100)}...`);
          }
        } catch (analysisError) {
          console.warn(`Image analysis failed for ${entryData.uid}:`, analysisError.message);
        }
      }
      
      console.log(`   Added image metadata: primary=${images[0].substring(0, 50)}...`);
    } else {
      console.log(`   No images found for entry ${entryData.uid}`);
    }

    // Add additional fields that might be useful for search
    if (entryData.price) metadata.price = entryData.price;
    if (entryData.duration) metadata.duration = entryData.duration;
    if (entryData.author) metadata.author = entryData.author;

    // Enhanced flags for better search functionality
    metadata.visual_match = images.length > 0 ? true : false;
    metadata.multimodal_content = images.length > 0 ? true : false;

    // Update in Pinecone
    const vectorId = `${entryData.uid}_${locale}`;
    await index.upsert([{
      id: vectorId,
      values: embedding,
      metadata: metadata
    }]);

    console.log(`Successfully reindexed entry: ${entryData.uid} (${vectorId}) as type: ${mappedType}`);
  } catch (error) {
    console.error(`Failed to reindex entry ${entryData.uid}:`, error);
    throw error;
  }
}

// Helper function to remove entry from index
async function removeFromIndex(entryUid, contentType, locale, index) {
  try {
    // Remove specific locale version
    const vectorId = `${entryUid}_${locale}`;
    await index.deleteOne(vectorId);
    
    console.log(`Successfully removed entry from index: ${vectorId}`);
  } catch (error) {
    console.error(`Failed to remove entry ${entryUid} from index:`, error);
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
  console.log('Search request received:', req.body);
  
  try {
    const { query, contentTypes = [], locales = [] } = req.body;
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ 
        error: "Query is required and must be a non-empty string",
        received: { query, type: typeof query }
      });
    }

    console.log(`Processing query: "${query}"`);
    console.log(`Content types filter: ${contentTypes}`);
    console.log(`Locales filter: ${locales}`);

    // Detect if this is a visual query
    const visualAnalysis = isVisualQuery(query);
    console.log(`Visual query analysis:`, visualAnalysis);

    // Generate embedding for query using Cohere
    console.log('Generating embeddings with Cohere...');
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
      console.error('Cohere embedding response:', embedResponse);
      throw new Error("Failed to get embeddings from Cohere");
    }

    if (!Array.isArray(queryVector) || queryVector.length === 0) {
      throw new Error("Invalid vector format from Cohere");
    }

    console.log(`Generated vector with dimension: ${queryVector.length}`);

    // Query Pinecone index
    console.log('Querying Pinecone index...');
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

    console.log('Query options:', JSON.stringify(queryOptions, null, 2));

    const searchResult = await index.query(queryOptions);
    
    console.log(`Pinecone returned ${searchResult.matches?.length || 0} matches`);

    // Process and return results
    const results = (searchResult.matches || []).map((item, index) => {
      const metadata = item.metadata || {};
      
      return {
        id: item.id,
        title: metadata.title || `Result ${index + 1}`,
        type: metadata.type || 'article', // Use mapped type with fallback
        contentType: metadata.type || 'article',
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
        imageAnalyzed: !!metadata.image_analysis,
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

    console.log(`Returning ${sortedResults.length} processed results`);
    console.log(`Image statistics:`, imageStats);
    
    // Log final processed scores
    if (sortedResults.length > 0) {
      console.log('Final sorted scores (first 5):');
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
    console.error('Search error:', error);
    
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

    console.log(`Analyzing image: ${imageUrl}`);

    const analysis = await analyzeImageWithAI(imageUrl, '', query);

    res.json({
      analysis: analysis || "Unable to analyze image",
      imageUrl,
      query: query || null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Image analysis error:', error);
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
    console.error('Test data error:', error);
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
      hasImages: !!(match.metadata?.primary_image || match.metadata?.all_images),
      imageAnalyzed: !!match.metadata?.image_analysis
    })) || [];
    
    res.json({
      status: 'success',
      sampleVectors: debugResults,
      totalFound: debugResults.length
    });
    
  } catch (error) {
    console.error('Debug vectors error:', error);
    res.status(500).json({
      error: 'Failed to debug vectors',
      details: error.message
    });
  }
});

// ===========================================
// WEBHOOK ENDPOINTS - ENHANCED INTEGRATION
// ===========================================

// Webhook handler for Contentstack content changes
app.post('/api/webhook/contentstack', authenticateWebhook, async (req, res) => {
  try {
    console.log('Received Contentstack webhook:', JSON.stringify(req.body, null, 2));
    
    const { event, data, module } = req.body;
    
    if (!event || !data) {
      console.log('Invalid webhook payload - missing event or data');
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // Handle asset events separately
    if (module === 'asset' || (data.asset && data.asset.uid)) {
      console.log(`Asset event: ${event} for asset ${data.asset?.uid || data.uid}`);
      return res.status(200).json({ 
        success: true, 
        message: 'Asset webhook received but not processed',
        event,
        assetUid: data.asset?.uid || data.uid
      });
    }

    // Handle different webhook payload structures for entries
    let entryData, contentType, entryUid, locale;

    if (module === 'entry' && data.entry) {
      // Standard entry webhook
      entryData = data.entry;
      contentType = entryData.content_type_uid;
      entryUid = entryData.uid;
      locale = entryData.locale || 'en-us';
    } else if (data.uid && data.content_type_uid) {
      // Direct entry data
      entryData = data;
      contentType = data.content_type_uid;
      entryUid = data.uid;
      locale = data.locale || 'en-us';
    } else {
      console.log('Unsupported webhook payload structure:', { 
        event, 
        dataKeys: Object.keys(data), 
        module,
        hasContentTypeUid: !!data.content_type_uid,
        hasUid: !!data.uid
      });
      
      // Check if this might be an entry without content_type_uid
      if (data.uid && !data.content_type_uid && !data.asset) {
        console.log('Entry-like payload without content_type_uid, attempting to fetch from Contentstack...');
        
        try {
          // Try to determine content type by fetching the entry
          const contentTypes = await Stack.getContentTypes();
          let foundEntry = null;
          let foundContentType = null;
          
          for (const ct of contentTypes.content_types || []) {
            try {
              const entry = await Stack.ContentType(ct.uid).Entry(data.uid).toJSON().fetch();
              if (entry && entry.uid === data.uid) {
                foundEntry = entry;
                foundContentType = ct.uid;
                break;
              }
            } catch (e) {
              // Entry not found in this content type, continue
            }
          }
          
          if (foundEntry && foundContentType) {
            console.log(`Found entry ${data.uid} in content type ${foundContentType}`);
            entryData = foundEntry;
            contentType = foundContentType;
            entryUid = data.uid;
            locale = foundEntry.locale || 'en-us';
          } else {
            console.log(`Could not find entry ${data.uid} in any content type`);
            return res.status(404).json({ 
              error: 'Entry not found in any content type',
              uid: data.uid
            });
          }
        } catch (fetchError) {
          console.error('Failed to fetch entry details:', fetchError.message);
          return res.status(500).json({
            error: 'Failed to determine content type',
            details: fetchError.message
          });
        }
      } else {
        return res.status(400).json({ 
          error: 'Unsupported payload structure',
          received: { event, module, dataKeys: Object.keys(data) }
        });
      }
    }

    console.log(`Processing webhook: ${event} for ${contentType}:${entryUid} (${locale})`);

    // Debug the webhook data structure
    console.log(`Webhook entry data structure:`, {
      uid: entryData.uid,
      title: entryData.title,
      availableFields: Object.keys(entryData).filter(key => !key.startsWith('_')),
      imageField: entryData.image ? 'present' : 'absent',
      featuredImageField: entryData.featured_image ? 'present' : 'absent',
      imagesField: entryData.images ? 'present' : 'absent',
      hasImageFields: !!(entryData.image || entryData.featured_image || entryData.images)
    });

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
        console.log(`Asset event handled: ${event}`);
        break;
        
      default:
        console.log(`Unhandled webhook event: ${event}`);
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
    console.error('Webhook processing error:', error);
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
    ],
    assetEventsHandled: [
      'asset.publish',
      'asset.update',
      'asset.unpublish', 
      'asset.delete'
    ]
  });
});

// Manual reindex endpoint for specific entries
app.post('/api/reindex/:contentType/:entryUid', authenticateWebhook, async (req, res) => {
  try {
    const { contentType, entryUid } = req.params;
    const { locale = 'en-us' } = req.body;

    console.log(`Manual reindex requested for ${contentType}:${entryUid}`);

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
    console.error('Manual reindex error:', error);
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

    console.log(`Bulk reindex requested for content type: ${contentType}`);

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
        console.log(`Reindexed: ${entry.uid}`);
      } catch (error) {
        errorCount++;
        errors.push({
          uid: entry.uid,
          error: error.message
        });
        console.error(`Failed to reindex ${entry.uid}:`, error.message);
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
    console.error('Bulk reindex error:', error);
    res.status(500).json({
      error: 'Bulk reindex failed',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
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
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Health check available at: http://localhost:${PORT}/health`);
    console.log(`Search endpoint: http://localhost:${PORT}/search`);
    console.log(`Image analysis endpoint: http://localhost:${PORT}/analyze-image`);
    console.log(`Test data endpoint: http://localhost:${PORT}/test-data`);
    console.log(`Debug vectors endpoint: http://localhost:${PORT}/debug-vectors`);
    console.log(`Debug Contentstack endpoint: http://localhost:${PORT}/debug-contentstack/:contentType`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/api/webhook/contentstack`);
    console.log(`Manual reindex endpoint: http://localhost:${PORT}/api/reindex/:contentType/:entryUid`);
    console.log(`Contentstack region: ${process.env.CONTENTSTACK_REGION || 'US'}`);
    console.log(`Features enabled:`);
    console.log(`   - Semantic search: ✅`);
    console.log(`   - Image analysis: ${openai ? '✅ (with gpt-4o-mini)' : '❌ (OpenAI API key not configured)'}`);
    console.log(`   - Multimodal search: ✅`);
    console.log(`   - Debug endpoints: ✅`);
    console.log(`   - Webhook integration: ✅`);
    console.log(`   - Real-time sync: ✅`);
    console.log(`   - Enhanced asset handling: ✅`);
    console.log(`   - Enhanced content type mapping: ✅`);
  });
}