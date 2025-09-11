import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pinecone } from "@pinecone-database/pinecone";
import { CohereClient } from "cohere-ai";
import OpenAI from "openai";
import contentstack from '@contentstack/delivery-sdk';

dotenv.config();

// Validate environment variables
const requiredEnvVars = [
  'COHERE_API_KEY',
  'PINECONE_API_KEY',
  'PINECONE_INDEX',
  'CONTENTSTACK_API_KEY',
  'CONTENTSTACK_DELIVERY_TOKEN',
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

// Initialize Pinecone
let pinecone;
try {
  pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });
  console.log('Pinecone client initialized successfully');
} catch (error) {
  console.error('Failed to initialize Pinecone:', error.message);
  process.exit(1);
}

// Initialize OpenAI only if API key is provided
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('OpenAI client initialized successfully');
} else {
  console.log('OpenAI API key not provided - image analysis will be disabled');
}

// Content Type Mapping Function
function mapContentTypeToDisplayType(contentTypeUid) {
  // Map Contentstack content type UIDs to your display types
  const contentTypeMap = {
    // Common Contentstack content type patterns
    'article': 'article',
    'blog': 'article', 
    'blog_post': 'article',
    'news': 'article',
    'page': 'article',
    'post': 'article',
    'content': 'article',
    'text': 'article',
    'document': 'article',
    'story': 'article',
    
    'product': 'product',
    'products': 'product',
    'item': 'product',
    'catalog': 'product',
    'shop': 'product',
    'merchandise': 'product',
    'goods': 'product',
    
    'video': 'video',
    'videos': 'video',
    'movie': 'video',
    'film': 'video',
    'clip': 'video',
    'tutorial': 'video',
    'webinar': 'video',
    
    'media': 'media',
    'image': 'media',
    'gallery': 'media',
    'asset': 'media',
    'file': 'media',
    'photo': 'media',
    'picture': 'media'
  };
  
  if (!contentTypeUid) return 'article'; // default fallback
  
  const lowerUid = contentTypeUid.toLowerCase();
  
  // Direct match
  if (contentTypeMap[lowerUid]) {
    return contentTypeMap[lowerUid];
  }
  
  // Partial match - check if any key is contained in the UID
  for (const [key, value] of Object.entries(contentTypeMap)) {
    if (lowerUid.includes(key)) {
      return value;
    }
  }
  
  // If no match found, try to infer from common patterns
  if (lowerUid.includes('vid')) return 'video';
  if (lowerUid.includes('img') || lowerUid.includes('pic')) return 'media';
  if (lowerUid.includes('prod') || lowerUid.includes('shop') || lowerUid.includes('buy')) return 'product';
  
  // Default fallback
  return 'article';
}

// Extract content type with better mapping
function extractContentType(entryData) {
  // Try different possible fields for content type
  let contentTypeUid = entryData._content_type_uid || 
                       entryData.content_type_uid || 
                       entryData.contentType || 
                       entryData.type ||
                       'article';
  
  // Map to display type
  return mapContentTypeToDisplayType(contentTypeUid);
}

// Contentstack region helper
const getContentstackRegion = (regionCode = 'US') => {
  const regionMap = {
    'US': 'US',
    'EU': 'EU', 
    'AZURE_NA': 'AZURE_NA',
    'AZURE_EU': 'AZURE_EU',
    'GCP_NA': 'GCP_NA',
    'us': 'US',
    'eu': 'EU',
    'azure-na': 'AZURE_NA',
    'azure-eu': 'AZURE_EU',
    'gcp-na': 'GCP_NA'
  };
  
  return regionMap[regionCode] || 'US';
};

// Initialize Contentstack
const initializeContentstack = () => {
  try {
    if (!process.env.CONTENTSTACK_API_KEY || !process.env.CONTENTSTACK_DELIVERY_TOKEN) {
      console.log('Contentstack credentials not provided in environment variables');
      return null;
    }

    const stackConfig = {
      apiKey: process.env.CONTENTSTACK_API_KEY,
      deliveryToken: process.env.CONTENTSTACK_DELIVERY_TOKEN,
      environment: process.env.CONTENTSTACK_ENVIRONMENT || 'production',
      region: getContentstackRegion(process.env.CONTENTSTACK_REGION || 'US')
    };

    console.log('Contentstack config:', {
      apiKey: stackConfig.apiKey ? stackConfig.apiKey.substring(0, 8) + '...' : 'missing',
      deliveryToken: stackConfig.deliveryToken ? stackConfig.deliveryToken.substring(0, 8) + '...' : 'missing',
      environment: stackConfig.environment,
      region: process.env.CONTENTSTACK_REGION || 'US'
    });

    const Stack = contentstack.stack(stackConfig);
    console.log('Contentstack Stack initialized successfully');
    return Stack;
  } catch (error) {
    console.error('Failed to initialize Contentstack:', error.message);
    return null;
  }
};

const Stack = initializeContentstack();

const app = express();

// Middleware
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

// Helper Functions
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

function isImageUrl(url) {
  if (!url) return false;
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  const urlLower = url.toLowerCase();
  return imageExtensions.some(ext => urlLower.includes(ext)) || 
         urlLower.includes('/images/') || 
         urlLower.includes('image');
}

function extractImageUrls(entry) {
  const images = [];
  
  const imageFields = [
    'image', 'featured_image', 'banner_image', 'thumbnail', 'photo', 'picture', 'media',
    'product_image', 'media_file', 'asset', 'file'
  ];
  
  imageFields.forEach(field => {
    if (entry.hasOwnProperty(field) && entry[field]) {
      if (typeof entry[field] === 'string' && entry[field].includes('contentstack.com')) {
        images.push(ensureHttpsUrl(entry[field]));
      } else if (entry[field].url && isImageUrl(entry[field].url)) {
        images.push(ensureHttpsUrl(entry[field].url));
      } else if (typeof entry[field] === 'object' && entry[field].href && isImageUrl(entry[field].href)) {
        images.push(ensureHttpsUrl(entry[field].href));
      }
    }
  });

  if (entry.images && Array.isArray(entry.images)) {
    entry.images.forEach(img => {
      if (typeof img === 'string' && img.includes('contentstack.com') && isImageUrl(img)) {
        images.push(ensureHttpsUrl(img));
      } else if (img && img.url && isImageUrl(img.url)) {
        images.push(ensureHttpsUrl(img.url));
      }
    });
  }

  if (entry.gallery && Array.isArray(entry.gallery)) {
    entry.gallery.forEach(item => {
      if (item && item.url && isImageUrl(item.url)) {
        images.push(ensureHttpsUrl(item.url));
      }
    });
  }

  return [...new Set(images)];
}

async function analyzeImageWithAI(imageUrl, maxRetries = 3) {
  if (!openai) return null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`    Analyzing image (attempt ${attempt}): ${imageUrl.substring(0, 80)}...`);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this image and describe what you see. Focus on: colors, objects, text, patterns, materials, style, and any distinctive visual features. Keep the description concise but comprehensive for search purposes."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "low"
                }
              }
            ]
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      });

      const analysis = response.choices[0]?.message?.content;
      if (analysis) {
        console.log(`    Image analysis successful: ${analysis.substring(0, 100)}...`);
        return analysis;
      }

    } catch (error) {
      console.error(`    Image analysis attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        if (error.message.includes('rate limit')) {
          console.log('    Rate limit hit, waiting 2 seconds before continuing...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else if (error.message.includes('unsupported image type')) {
          console.log('    Image type not supported, skipping analysis...');
        }
        return null;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  
  return null;
}

function extractTextContent(entry) {
  const textFields = [];
  
  if (entry.title) textFields.push(entry.title);
  if (entry.description) textFields.push(entry.description);
  if (entry.body) textFields.push(entry.body);
  if (entry.content) textFields.push(entry.content);
  if (entry.summary) textFields.push(entry.summary);
  
  const additionalFields = ['excerpt', 'overview', 'introduction', 'subtitle', 'text'];
  additionalFields.forEach(field => {
    if (entry[field] && typeof entry[field] === 'string') {
      textFields.push(entry[field]);
    }
  });
  
  if (entry.rich_text_editor && typeof entry.rich_text_editor === 'object') {
    if (entry.rich_text_editor.children) {
      const richText = extractFromRichTextEditor(entry.rich_text_editor.children);
      if (richText) textFields.push(richText);
    }
  }
  
  return textFields.join(' ').substring(0, 8000);
}

function extractFromRichTextEditor(children) {
  if (!Array.isArray(children)) return '';
  
  let text = '';
  children.forEach(child => {
    if (child.text) {
      text += child.text + ' ';
    } else if (child.children) {
      text += extractFromRichTextEditor(child.children) + ' ';
    }
  });
  
  return text.trim();
}

function cleanTextContent(text) {
  if (!text) return '';
  
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isVisualQuery(query) {
  const visualKeywords = [
    'red', 'blue', 'green', 'yellow', 'black', 'white', 'brown', 'pink', 'purple', 'orange', 'gray', 'grey',
    'silver', 'gold', 'navy', 'maroon', 'crimson', 'scarlet', 'burgundy',
    'color', 'colored', 'bright', 'dark', 'light',
    'stripe', 'striped', 'pattern', 'design', 'logo', 'symbol',
    'round', 'square', 'circular', 'rectangular',
    'texture', 'material', 'fabric', 'leather', 'metal',
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

function processImageData(results) {
  let multimodalResultsCount = 0;
  let analyzedImageCount = 0;
  let totalImagesFound = 0;

  results.forEach(result => {
    if (result.metadata?.primary_image || result.metadata?.primaryImage) {
      result.hasImages = true;
      result.primaryImage = result.metadata.primary_image || result.metadata.primaryImage;
      multimodalResultsCount++;
      totalImagesFound++;
    }

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

    if (result.metadata?.image_analysis || result.metadata?.imageAnalysis) {
      result.imageAnalyzed = true;
      analyzedImageCount++;
    }

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

// Webhook authentication middleware
const authenticateWebhook = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    console.log('Webhook authentication failed: No basic auth header');
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

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

// Enhanced reindex function with improved content type handling
async function reindexEntryWithImageAnalysis(entryData, originalContentType, locale, index) {
  try {
    console.log(`Processing entry with image analysis: ${entryData.uid}`);
    console.log(`Original content type: ${originalContentType}`);
    console.log(`Entry _content_type_uid: ${entryData._content_type_uid}`);

    const rawText = extractTextContent(entryData);
    const cleanText = cleanTextContent(rawText);
    
    if (!cleanText || cleanText.length < 10) {
      console.log(`Skipping entry ${entryData.uid}: insufficient content (${cleanText.length} chars)`);
      return;
    }

    // Extract and map content type properly
    const mappedContentType = extractContentType(entryData);
    console.log(`Mapped content type: ${mappedContentType}`);

    const imageUrls = extractImageUrls(entryData);
    console.log(`Found ${imageUrls.length} images for ${entryData.uid}`);
    if (imageUrls.length > 0) {
      console.log('Image URLs:', imageUrls);
    }

    let imageAnalysis = null;
    let combinedContent = cleanText;

    if (imageUrls.length > 0 && openai) {
      try {
        console.log(`Analyzing primary image for ${entryData.uid}...`);
        const primaryImageAnalysis = await analyzeImageWithAI(imageUrls[0]);
        if (primaryImageAnalysis) {
          imageAnalysis = primaryImageAnalysis;
          combinedContent = `${cleanText} Image description: ${primaryImageAnalysis}`;
          console.log(`Image analysis completed for ${entryData.uid}`);
        } else {
          console.log(`Image analysis failed or skipped for ${entryData.uid}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (imageError) {
        console.error(`Image analysis failed for ${entryData.uid}:`, imageError.message);
      }
    }

    console.log(`Generating embedding for: ${entryData.title || entryData.uid}`);
    const embedResponse = await cohere.embed({ 
      model: "embed-english-light-v3.0",
      texts: [combinedContent],
      inputType: "search_document"
    });
    
    let vector;
    if (embedResponse?.embeddings?.[0]) {
      vector = embedResponse.embeddings[0];
    } else if (embedResponse?.body?.embeddings?.[0]) {
      vector = embedResponse.body.embeddings[0];
    }
    
    if (!vector || !Array.isArray(vector)) {
      throw new Error(`Failed to generate embedding for entry ${entryData.uid}`);
    }

    let tags = [];
    if (entryData.tags) {
      if (Array.isArray(entryData.tags)) {
        tags = entryData.tags.map(tag => {
          if (typeof tag === 'object' && tag !== null) {
            return tag.name || tag.title || tag.uid || String(tag);
          }
          return String(tag);
        }).filter(tag => tag && tag.length > 0);
      } else if (typeof entryData.tags === 'string') {
        tags = entryData.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      }
    }

    const metadata = {
      title: entryData.title || 'Untitled',
      type: mappedContentType, // Use the mapped content type
      snippet: cleanText.substring(0, 500),
      locale: locale || 'en-us',
      tags: tags,
      date: entryData.updated_at || entryData.created_at || new Date().toISOString(),
      content_type_uid: entryData._content_type_uid || originalContentType || mappedContentType,
      original_content_type: originalContentType, // Keep original for debugging
      mapped_content_type: mappedContentType, // Keep mapped for debugging
      uid: entryData.uid,
      url: entryData.url || '',
      primary_image: imageUrls[0] || null,
      all_images: imageUrls.length > 0 ? imageUrls : null,
      image_count: imageUrls.length,
      has_images: imageUrls.length > 0,
      image_analysis: imageAnalysis || null,
      category: entryData.category || null,
      price: entryData.price || null,
      duration: entryData.duration || null,
      visual_match: imageAnalysis ? true : false,
      multimodal_content: imageAnalysis ? true : false
    };

    // Remove null/undefined values
    Object.keys(metadata).forEach(key => {
      if (metadata[key] === null || metadata[key] === undefined) {
        delete metadata[key];
      }
    });

    const vectorId = `${entryData.uid}_${locale}`;
    await index.upsert([{
      id: vectorId,
      values: vector,
      metadata: metadata
    }]);

    console.log(`Successfully reindexed entry with image analysis: ${entryData.uid} (${vectorId})`);
    console.log(`Content type mapping: ${originalContentType} -> ${mappedContentType}`);

  } catch (error) {
    console.error(`Failed to reindex entry ${entryData.uid}:`, error.message);
    throw error;
  }
}

// Webhook handler functions with improved content type handling
async function handleEntryPublish(entryData, contentType, locale, index) {
  console.log(`Publishing entry: ${entryData.uid} with content type: ${contentType}`);
  await reindexEntryWithImageAnalysis(entryData, contentType, locale, index);
}

async function handleEntryUpdate(entryData, contentType, locale, index) {
  console.log(`Updating entry: ${entryData.uid} with content type: ${contentType}`);
  await reindexEntryWithImageAnalysis(entryData, contentType, locale, index);
}

async function handleEntryUnpublish(entryUid, contentType, locale, index) {
  console.log(`Unpublishing entry: ${entryUid}`);
  await removeFromIndex(entryUid, contentType, locale, index);
}

async function handleEntryDelete(entryUid, contentType, locale, index) {
  console.log(`Deleting entry: ${entryUid}`);
  await removeFromIndex(entryUid, contentType, locale, index);
}

async function removeFromIndex(entryUid, contentType, locale, index) {
  try {
    const vectorId = `${entryUid}_${locale}`;
    await index.deleteOne(vectorId);
    console.log(`Successfully removed entry from index: ${vectorId}`);
  } catch (error) {
    console.error(`Failed to remove entry ${entryUid} from index:`, error.message);
    throw error;
  }
}

// API Endpoints
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    region: process.env.CONTENTSTACK_REGION || 'US',
    features: {
      semantic_search: true,
      image_analysis: !!openai,
      multimodal_search: true,
      webhook_integration: true,
      contentstack_connected: !!Stack,
      real_time_image_processing: !!openai,
      content_type_mapping: true
    }
  });
});

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

    const visualAnalysis = isVisualQuery(query);
    console.log('Visual query analysis:', visualAnalysis);

    console.log('Generating embeddings with Cohere...');
    const embedResponse = await cohere.embed({
      model: "embed-english-light-v3.0",
      texts: [query.trim()],
      inputType: "search_query"
    });

    let queryVector;
    
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

    console.log('Querying Pinecone index...');
    const index = pinecone.Index(process.env.PINECONE_INDEX);
    
    const queryOptions = {
      vector: queryVector,
      topK: 20,
      includeMetadata: true,
    };

    if (contentTypes.length > 0 || locales.length > 0) {
      queryOptions.filter = {};
      
      if (contentTypes.length > 0) {
        queryOptions.filter.type = { "$in": contentTypes };
      }
      
      if (locales.length > 0) {
        queryOptions.filter.locale = { "$in": locales };
      }
    }

    const searchResult = await index.query(queryOptions);
    console.log(`Pinecone returned ${searchResult.matches?.length || 0} matches`);

    const results = (searchResult.matches || []).map((item, index) => {
      const metadata = item.metadata || {};
      
      // Ensure content type is properly mapped
      let contentType = metadata.type || metadata.mapped_content_type || 'article';
      if (contentType === 'unknown' || !contentType) {
        contentType = mapContentTypeToDisplayType(metadata.content_type_uid || metadata.original_content_type);
      }
      
      return {
        id: item.id,
        title: metadata.title || `Result ${index + 1}`,
        type: contentType,
        contentType: contentType,
        snippet: metadata.snippet || metadata.description || 'No description available',
        locale: metadata.locale || 'en-us',
        tags: Array.isArray(metadata.tags) ? metadata.tags : 
              (typeof metadata.tags === 'string' ? metadata.tags.split(',').map(t => t.trim()) : []),
        similarity: Math.min(Math.max(item.score || 0, 0), 1),
        relevance: Math.min(Math.max(item.score || 0, 0), 1),
        date: metadata.date || metadata.updated_at || new Date().toISOString().split('T')[0],
        lastModified: metadata.date || metadata.updated_at || new Date().toISOString().split('T')[0],
        url: metadata.url || '',
        contentTypeUid: metadata.content_type_uid || contentType,
        originalScore: item.score,
        primary_image: metadata.primary_image,
        primaryImage: metadata.primary_image,
        all_images: metadata.all_images,
        allImages: metadata.all_images,
        image_analysis: metadata.image_analysis,
        imageAnalysis: metadata.image_analysis,
        visual_match: metadata.visual_match,
        visualMatch: metadata.visual_match,
        category: metadata.category,
        price: metadata.price,
        duration: metadata.duration
      };
    });

    const sortedResults = results.sort((a, b) => b.relevance - a.relevance);
    const imageStats = processImageData(sortedResults);

    const searchContext = {
      isVisualQuery: visualAnalysis.isVisual,
      visualConfidence: visualAnalysis.confidence,
      matchedVisualKeywords: visualAnalysis.matchedKeywords,
      ...imageStats
    };

    console.log(`Returning ${sortedResults.length} processed results`);

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
    
    let errorMessage = 'Search failed';
    let statusCode = 500;
    
    if (error.message.includes('Cohere')) {
      errorMessage = 'Failed to generate embeddings. Please check your Cohere API key.';
      statusCode = 503;
    } else if (error.message.includes('Pinecone')) {
      errorMessage = 'Failed to search vector database. Please check your Pinecone configuration.';
      statusCode = 503;
    }

    res.status(statusCode).json({ 
      error: errorMessage,
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

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

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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
    console.error('Image analysis error:', error);
    res.status(500).json({
      error: "Image analysis failed",
      details: error.message
    });
  }
});

// Webhook endpoint with improved content type handling
app.post('/api/webhook/contentstack', authenticateWebhook, async (req, res) => {
  try {
    console.log('Received Contentstack webhook:', JSON.stringify(req.body, null, 2));
    
    const { event, data, module } = req.body;
    
    if (!event || !data) {
      console.log('Invalid webhook payload - missing event or data');
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    if (module === 'asset' || (data.asset && data.asset.uid)) {
      console.log(`Asset event: ${event} for asset ${data.asset?.uid || data.uid}`);
      return res.status(200).json({ 
        success: true, 
        message: 'Asset webhook received but not processed',
        event,
        assetUid: data.asset?.uid || data.uid
      });
    }

    let entryData, contentType, entryUid, locale;

    if (module === 'entry' && data.entry) {
      entryData = data.entry;
      contentType = entryData._content_type_uid || entryData.content_type_uid;
      entryUid = entryData.uid;
      locale = entryData.locale || 'en-us';
    } else if (data.uid && (data.content_type_uid || data._content_type_uid)) {
      entryData = data;
      contentType = data._content_type_uid || data.content_type_uid;
      entryUid = data.uid;
      locale = data.locale || 'en-us';
    } else {
      console.log('Unsupported webhook payload structure:', { 
        event, 
        dataKeys: Object.keys(data), 
        module,
        hasContentTypeUid: !!(data.content_type_uid || data._content_type_uid),
        hasUid: !!data.uid
      });
      
      return res.status(400).json({ 
        error: 'Unsupported payload structure',
        received: { event, module, dataKeys: Object.keys(data) }
      });
    }

    console.log(`Processing webhook with IMAGE ANALYSIS: ${event} for ${contentType}:${entryUid} (${locale})`);
    console.log(`Original content type UID: ${contentType}`);
    console.log(`Entry _content_type_uid: ${entryData._content_type_uid}`);

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
      message: 'Webhook processed successfully with image analysis',
      event,
      entryUid: entryUid || 'asset',
      contentType: contentType || 'asset',
      mappedContentType: contentType ? mapContentTypeToDisplayType(contentType) : null,
      imageAnalysisEnabled: !!openai,
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
    imageAnalysisEnabled: !!openai,
    contentTypeMappingEnabled: true,
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

// Manual reindex endpoint with improved content type handling
app.post('/api/reindex/:contentType/:entryUid', authenticateWebhook, async (req, res) => {
  try {
    const { contentType, entryUid } = req.params;
    const { locale = 'en-us', apiKey, deliveryToken, region = 'US', environment = 'production' } = req.body;

    console.log(`Manual reindex with image analysis requested for ${contentType}:${entryUid}`);

    const stackConfig = {
      apiKey: apiKey || process.env.CONTENTSTACK_API_KEY,
      deliveryToken: deliveryToken || process.env.CONTENTSTACK_DELIVERY_TOKEN,
      environment: environment,
      region: getContentstackRegion(region)
    };

    if (!stackConfig.apiKey || !stackConfig.deliveryToken) {
      return res.status(400).json({
        error: 'Contentstack credentials required',
        details: 'Provide apiKey and deliveryToken in request body or set environment variables'
      });
    }

    const tempStack = contentstack.stack(stackConfig);
    
    const entry = await tempStack.ContentType(contentType).Entry(entryUid).toJSON().fetch();
    
    if (!entry) {
      return res.status(404).json({
        error: 'Entry not found',
        contentType,
        entryUid
      });
    }

    const index = pinecone.Index(process.env.PINECONE_INDEX);
    await reindexEntryWithImageAnalysis(entry, contentType, locale, index);

    const mappedType = mapContentTypeToDisplayType(contentType);

    res.json({
      success: true,
      message: 'Entry reindexed successfully with image analysis',
      entryUid,
      originalContentType: contentType,
      mappedContentType: mappedType,
      locale,
      title: entry.title || 'Untitled',
      imageAnalysisEnabled: !!openai
    });

  } catch (error) {
    console.error('Manual reindex error:', error);
    res.status(500).json({
      error: 'Manual reindex failed',
      details: error.message
    });
  }
});

// Full sync endpoint with improved content type handling
app.post('/api/sync-all', authenticateWebhook, async (req, res) => {
  try {
    const { 
      contentTypes = ['article', 'video', 'product', 'media'],
      limit = 50,
      apiKey,
      deliveryToken,
      region = 'US',
      environment = 'production'
    } = req.body;

    console.log('Starting full sync with image analysis and improved content type mapping...');
    console.log(`Target content types: ${contentTypes.join(', ')}`);
    console.log(`Image analysis: ${openai ? 'Enabled' : 'Disabled'}`);

    const stackConfig = {
      apiKey: apiKey || process.env.CONTENTSTACK_API_KEY,
      deliveryToken: deliveryToken || process.env.CONTENTSTACK_DELIVERY_TOKEN,
      environment: environment,
      region: getContentstackRegion(region)
    };

    if (!stackConfig.apiKey || !stackConfig.deliveryToken) {
      return res.status(400).json({
        error: 'Contentstack credentials required'
      });
    }

    const tempStack = contentstack.stack(stackConfig);
    const index = pinecone.Index(process.env.PINECONE_INDEX);

    let totalProcessed = 0;
    let totalFailed = 0;
    let totalImagesAnalyzed = 0;
    const results = {};

    for (const contentType of contentTypes) {
      try {
        console.log(`Processing content type: ${contentType}`);
        
        const query = tempStack.ContentType(contentType).Query().limit(limit);
        const result = await query.toJSON().find();
        
        let entries = [];
        if (result && Array.isArray(result)) {
          entries = Array.isArray(result[0]) ? result[0] : result;
        } else if (result && result.entries) {
          entries = result.entries;
        }

        console.log(`Found ${entries.length} entries for ${contentType}`);

        let processed = 0;
        let failed = 0;
        let imagesAnalyzed = 0;

        for (const entry of entries) {
          try {
            const imageUrls = extractImageUrls(entry);
            if (imageUrls.length > 0 && openai) {
              imagesAnalyzed++;
            }

            await reindexEntryWithImageAnalysis(entry, contentType, entry.locale || 'en-us', index);
            processed++;
            
            await new Promise(resolve => setTimeout(resolve, 200));
            
          } catch (entryError) {
            console.error(`Failed to sync entry ${entry.uid}:`, entryError.message);
            failed++;
          }
        }

        const mappedType = mapContentTypeToDisplayType(contentType);

        results[contentType] = {
          total: entries.length,
          processed,
          failed,
          imagesAnalyzed,
          originalContentType: contentType,
          mappedContentType: mappedType
        };

        totalProcessed += processed;
        totalFailed += failed;
        totalImagesAnalyzed += imagesAnalyzed;

        console.log(`${contentType} -> ${mappedType} completed: ${processed} processed, ${failed} failed, ${imagesAnalyzed} images analyzed`);

      } catch (contentTypeError) {
        console.error(`Failed to process content type ${contentType}:`, contentTypeError.message);
        results[contentType] = {
          error: contentTypeError.message,
          originalContentType: contentType,
          mappedContentType: mapContentTypeToDisplayType(contentType)
        };
      }
    }

    res.json({
      success: true,
      message: 'Full sync with image analysis and content type mapping completed',
      summary: {
        totalProcessed,
        totalFailed,
        totalImagesAnalyzed,
        imageAnalysisEnabled: !!openai,
        contentTypeMappingEnabled: true,
        contentTypesProcessed: contentTypes.length
      },
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Full sync error:', error);
    res.status(500).json({
      error: 'Full sync failed',
      details: error.message
    });
  }
});

// Test data endpoint
app.get('/test-data', async (req, res) => {
  try {
    const index = pinecone.Index(process.env.PINECONE_INDEX);
    const stats = await index.describeIndexStats();
    
    res.json({
      status: 'success',
      indexStats: stats,
      hasData: stats.totalVectorCount > 0,
      imageAnalysisEnabled: !!openai,
      contentTypeMappingEnabled: true
    });
  } catch (error) {
    console.error('Test data error:', error);
    res.status(500).json({
      error: 'Failed to check index stats',
      details: error.message
    });
  }
});

// Debug vectors endpoint with content type info
app.get('/debug-vectors', async (req, res) => {
  try {
    const index = pinecone.Index(process.env.PINECONE_INDEX);
    
    const debugQuery = await index.query({
      vector: new Array(384).fill(0),
      topK: 10,
      includeMetadata: true,
    });
    
    const debugResults = debugQuery.matches?.map(match => ({
      id: match.id,
      title: match.metadata?.title,
      originalType: match.metadata?.original_content_type,
      mappedType: match.metadata?.type || match.metadata?.mapped_content_type,
      contentTypeUid: match.metadata?.content_type_uid,
      score: match.score,
      hasImages: !!(match.metadata?.primary_image || match.metadata?.all_images),
      hasImageAnalysis: !!match.metadata?.image_analysis,
      imageCount: match.metadata?.image_count || 0
    })) || [];
    
    res.json({
      status: 'success',
      sampleVectors: debugResults,
      totalFound: debugResults.length,
      imageAnalysisEnabled: !!openai,
      contentTypeMappingEnabled: true
    });
    
  } catch (error) {
    console.error('Debug vectors error:', error);
    res.status(500).json({
      error: 'Failed to debug vectors',
      details: error.message
    });
  }
});

// Content type mapping test endpoint
app.get('/api/test-content-types', (req, res) => {
  const testTypes = [
    'article', 'blog_post', 'news', 'product', 'video', 'media',
    'unknown_type', 'custom_article', 'my_product', 'video_tutorial'
  ];
  
  const mappings = testTypes.map(type => ({
    original: type,
    mapped: mapContentTypeToDisplayType(type)
  }));
  
  res.json({
    status: 'success',
    message: 'Content type mapping test',
    mappings,
    supportedDisplayTypes: ['article', 'product', 'video', 'media'],
    timestamp: new Date().toISOString()
  });
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

// Export for Vercel
export default app;

// Start server in development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Search endpoint: http://localhost:${PORT}/search`);
    console.log(`Image analysis: http://localhost:${PORT}/analyze-image`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/api/webhook/contentstack`);
    console.log(`Full sync endpoint: http://localhost:${PORT}/api/sync-all`);
    console.log(`Content type test: http://localhost:${PORT}/api/test-content-types`);
    console.log(`Features enabled:`);
    console.log(`   - Semantic search: ✅`);
    console.log(`   - Real-time webhook processing: ✅`);
    console.log(`   - Image analysis: ${openai ? '✅ (with gpt-4o-mini)' : '❌ (OpenAI API key not configured)'}`);
    console.log(`   - Multimodal search: ✅`);
    console.log(`   - Auto image processing on webhook: ${openai ? '✅' : '❌'}`);
    console.log(`   - Content type mapping: ✅`);
    console.log(`Environment variables needed:`);
    console.log(`   - COHERE_API_KEY: ${process.env.COHERE_API_KEY ? '✅' : '❌'}`);
    console.log(`   - PINECONE_API_KEY: ${process.env.PINECONE_API_KEY ? '✅' : '❌'}`);
    console.log(`   - PINECONE_INDEX: ${process.env.PINECONE_INDEX ? '✅' : '❌'}`);
    console.log(`   - CONTENTSTACK_API_KEY: ${process.env.CONTENTSTACK_API_KEY ? '✅' : '❌'}`);
    console.log(`   - CONTENTSTACK_DELIVERY_TOKEN: ${process.env.CONTENTSTACK_DELIVERY_TOKEN ? '✅' : '❌'}`);
    console.log(`   - OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ (Image analysis enabled)' : '❌ (Image analysis disabled)'}`);
    console.log(`   - WEBHOOK_USERNAME: ${process.env.WEBHOOK_USERNAME || 'contentstack_webhook'}`);
    console.log(`   - WEBHOOK_PASSWORD: ${process.env.WEBHOOK_PASSWORD ? '✅' : '❌ (using default)'}`);
  });
}