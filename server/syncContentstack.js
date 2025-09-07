import dotenv from "dotenv";
import contentstack from "contentstack";
import { Pinecone } from "@pinecone-database/pinecone";
import { CohereClient } from "cohere-ai";
import OpenAI from "openai";
import fetch from "node-fetch";

dotenv.config();

// Validate environment variables
const requiredEnvVars = [
  'COHERE_API_KEY',
  'PINECONE_API_KEY', 
  'PINECONE_INDEX',
  'PINECONE_ENVIRONMENT',
  'CONTENTSTACK_API_KEY',
  'CONTENTSTACK_DELIVERY_TOKEN',
  'CONTENTSTACK_ENVIRONMENT'
];

console.log('Validating environment variables...');
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize clients
const cohere = new CohereClient({ 
  token: process.env.COHERE_API_KEY 
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

// Initialize OpenAI only if API key is provided
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('OpenAI client initialized for image analysis');
} else {
  console.log('OpenAI API key not provided - image analysis will be disabled');
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

// Connect to Contentstack
const Stack = contentstack.Stack({
  api_key: process.env.CONTENTSTACK_API_KEY,
  delivery_token: process.env.CONTENTSTACK_DELIVERY_TOKEN,
  environment: process.env.CONTENTSTACK_ENVIRONMENT,
  region: getContentstackRegion()
});

const indexName = process.env.PINECONE_INDEX;

// Debug function to inspect Contentstack entry structure
function debugContentstackEntry(entry, contentType, entryIndex = 0) {
  console.log(`\n=== DEBUG ENTRY ${entryIndex} for ${contentType} ===`);
  console.log('Entry UID:', entry.uid);
  console.log('Entry Title:', entry.title);
  
  // Log all field names to see what's available
  const allFields = Object.keys(entry).filter(key => !key.startsWith('_'));
  console.log('Available fields:', allFields);
  
  // Check for any field that might contain images
  const potentialImageFields = allFields.filter(field => {
    const value = entry[field];
    if (!value) return false;
    
    // Check if it's a string containing contentstack.io
    if (typeof value === 'string' && value.includes('contentstack.io')) return true;
    
    // Check if it's an object with url property
    if (typeof value === 'object' && value !== null && value.url) return true;
    
    // Check if it's an array
    if (Array.isArray(value)) return true;
    
    return false;
  });
  
  console.log('Potential image fields found:', potentialImageFields);
  
  // Inspect each potential image field in detail
  potentialImageFields.forEach(fieldName => {
    const fieldValue = entry[fieldName];
    console.log(`\n--- Field: ${fieldName} ---`);
    console.log('Type:', typeof fieldValue);
    console.log('Value:', JSON.stringify(fieldValue, null, 2));
    
    if (Array.isArray(fieldValue)) {
      console.log('Array length:', fieldValue.length);
      fieldValue.forEach((item, idx) => {
        console.log(`  Item ${idx}:`, typeof item, JSON.stringify(item, null, 2));
      });
    }
  });
  
  // Test the extractImageUrls function on this entry
  const extractedUrls = extractImageUrls(entry);
  console.log('Extracted URLs:', extractedUrls);
  
  console.log('=== END DEBUG ===\n');
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

// Helper function to extract image URLs from entry
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

// Helper function to ensure HTTPS URL
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

// Helper function to analyze image with OpenAI using updated model
async function analyzeImageWithAI(imageUrl, maxRetries = 3) {
  if (!openai) return null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`    Analyzing image (attempt ${attempt}): ${imageUrl.substring(0, 80)}...`);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Updated to current model
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
                  detail: "low" // Use low detail to save costs
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
        // If all attempts failed, check error type
        if (error.message.includes('rate limit')) {
          console.log(`    Rate limit hit, waiting 2 seconds before continuing...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else if (error.message.includes('unsupported image type')) {
          console.log(`    Image type not supported, skipping analysis...`);
        }
        return null;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  
  return null;
}

// Helper function to extract meaningful text from entry
function extractTextContent(entry) {
  const textFields = [];
  
  // Add title
  if (entry.title) textFields.push(entry.title);
  
  // Add description/body content
  if (entry.description) textFields.push(entry.description);
  if (entry.body) textFields.push(entry.body);
  if (entry.content) textFields.push(entry.content);
  if (entry.summary) textFields.push(entry.summary);
  
  // Add other common text fields
  const additionalFields = ['excerpt', 'overview', 'introduction', 'subtitle', 'text'];
  additionalFields.forEach(field => {
    if (entry[field] && typeof entry[field] === 'string') {
      textFields.push(entry[field]);
    }
  });
  
  // Handle rich text editor content
  if (entry.rich_text_editor && typeof entry.rich_text_editor === 'object') {
    if (entry.rich_text_editor.children) {
      const richText = extractFromRichTextEditor(entry.rich_text_editor.children);
      if (richText) textFields.push(richText);
    }
  }
  
  return textFields.join(' ').substring(0, 8000);
}

// Helper function to extract text from rich text editor format
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

// Helper function to clean HTML/markdown content
function cleanTextContent(text) {
  if (!text) return '';
  
  return text
    .replace(/<[^>]*>/g, ' ') // Remove HTML tags
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Convert markdown links to text
    .replace(/[#*_`]/g, '') // Remove markdown formatting
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Test Contentstack connection
async function testConnectionstack() {
  console.log('Testing Contentstack connection...');
  
  try {
    const contentTypes = await Stack.getContentTypes();
    console.log(`Connected successfully! Found ${contentTypes.content_types?.length || 0} content types`);
    
    if (contentTypes.content_types && contentTypes.content_types.length > 0) {
      console.log('Available Content Types:');
      contentTypes.content_types.forEach(ct => {
        console.log(`  - ${ct.uid} (${ct.title})`);
      });
      return contentTypes.content_types;
    }
    
    return [];
  } catch (error) {
    console.error('Contentstack connection failed:', error.message);
    throw error;
  }
}

// Modified fetchEntries function with debugging
async function fetchEntries(contentType) {
  console.log(`\nFetching entries for content type: ${contentType}`);
  
  try {
    let entries = [];
    let skip = 0;
    const limit = 5; // Reduced for debugging
    let hasMore = true;
    let totalCount = null;

    while (hasMore && entries.length < 10) { // Limit to 10 for debugging
      console.log(`  Fetching batch starting at ${skip}...`);
      
      try {
        const query = Stack.ContentType(contentType).Query()
          .skip(skip)
          .limit(limit);
        
        if (skip === 0) {
          query.includeCount();
        }
        
        const result = await query.toJSON().find();
        
        let batch = [];
        
        if (result && Array.isArray(result)) {
          if (Array.isArray(result[0])) {
            batch = result[0];
            if (skip === 0 && result[1] && typeof result[1].count === 'number') {
              totalCount = result[1].count;
              console.log(`  Total entries available: ${totalCount}`);
            }
          } else {
            batch = result;
          }
        } else if (result && result.entries && Array.isArray(result.entries)) {
          batch = result.entries;
          if (skip === 0 && typeof result.count === 'number') {
            totalCount = result.count;
            console.log(`  Total entries available: ${totalCount}`);
          }
        }

        if (batch && batch.length > 0) {
          entries.push(...batch);
          console.log(`  Fetched ${batch.length} entries (total so far: ${entries.length})`);
          
          // Debug the first few entries
          batch.forEach((entry, idx) => {
            if (entries.length <= 3) { // Debug first 3 entries only
              debugContentstackEntry(entry, contentType, entries.length - batch.length + idx);
            }
          });
          
          skip += limit;
          
          if (batch.length < limit) {
            hasMore = false;
          }
          
          if (totalCount !== null && entries.length >= totalCount) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
        
      } catch (queryError) {
        console.error(`  Query error at skip ${skip}:`, queryError.message);
        
        // If it's the first query that failed, try a simpler approach
        if (skip === 0) {
          console.log(`  Trying simple query without pagination...`);
          try {
            const simpleResult = await Stack.ContentType(contentType).Query().toJSON().find();
            
            if (simpleResult && Array.isArray(simpleResult[0])) {
              entries = simpleResult[0];
              console.log(`  Simple query successful: ${entries.length} entries`);
            } else if (simpleResult && Array.isArray(simpleResult)) {
              entries = simpleResult;
              console.log(`  Simple query successful: ${entries.length} entries`);
            }
          } catch (simpleError) {
            console.error(`  Simple query also failed:`, simpleError.message);
          }
        }
        
        hasMore = false;
      }
    }

    console.log(`  Total entries fetched for ${contentType}: ${entries.length}`);
    
    // Log sample of first entry for debugging
    if (entries.length > 0) {
      const sample = entries[0];
      console.log(`  Sample entry structure:`, {
        uid: sample.uid,
        title: sample.title,
        hasBody: !!sample.body,
        hasDescription: !!sample.description,
        hasContent: !!sample.content,
        hasImages: !!(sample.image || sample.featured_image || sample.images),
        fields: Object.keys(sample).filter(key => !key.startsWith('_'))
      });
    }
    
    return entries;
    
  } catch (error) {
    console.error(`Error fetching entries for ${contentType}:`, error.message);
    return [];
  }
}

// Enhanced upsert entries with image analysis
async function upsertEntries(entries, contentType) {
  if (!entries || entries.length === 0) {
    console.log(`No entries to upsert for ${contentType}`);
    return { processed: 0, failed: 0, skipped: 0 };
  }

  console.log(`\nStarting enhanced upsert of ${entries.length} entries for ${contentType}`);
  const index = pinecone.Index(indexName);
  const batchSize = 2; // Smaller batch size due to image processing
  
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  let imagesAnalyzed = 0;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    console.log(`  Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(entries.length/batchSize)} (entries ${i + 1}-${Math.min(i + batchSize, entries.length)})`);
    
    const vectors = [];
    
    for (const entry of batch) {
      try {
        if (!entry.uid) {
          console.log(`    Skipping entry without UID`);
          skipped++;
          continue;
        }
        
        // Extract and clean text content
        const rawText = extractTextContent(entry);
        const cleanText = cleanTextContent(rawText);
        
        if (!cleanText || cleanText.length < 10) {
          console.log(`    Skipping entry ${entry.uid}: insufficient content (${cleanText.length} chars)`);
          skipped++;
          continue;
        }

        console.log(`    Processing ${entry.uid}: ${cleanText.substring(0, 80)}...`);

        // Debug: Print the entire entry structure for the first few entries
        if (processed < 3) {
          console.log(`    DEBUG - Entry structure for ${entry.uid}:`);
          console.log(`      Title: ${entry.title}`);
          console.log(`      Available fields:`, Object.keys(entry).filter(key => !key.startsWith('_')));
          console.log(`      Featured Image field:`, JSON.stringify(entry.featured_image, null, 2));
          console.log(`      Image field:`, JSON.stringify(entry.image, null, 2));
          console.log(`      Images field:`, JSON.stringify(entry.images, null, 2));
        }

        // Extract image URLs
        const imageUrls = extractImageUrls(entry);
        console.log(`    Found ${imageUrls.length} images for ${entry.uid}`);
        if (imageUrls.length > 0) {
          console.log(`    Image URLs:`, imageUrls);
        }

        // Analyze images if available and OpenAI is configured
        let imageAnalysis = null;
        let combinedContent = cleanText;

        if (imageUrls.length > 0 && openai) {
          try {
            // Analyze the first image (primary image)
            const primaryImageAnalysis = await analyzeImageWithAI(imageUrls[0]);
            if (primaryImageAnalysis) {
              imageAnalysis = primaryImageAnalysis;
              combinedContent = `${cleanText} Image description: ${primaryImageAnalysis}`;
              imagesAnalyzed++;
              console.log(`    Image analysis completed for ${entry.uid}`);
            } else {
              console.log(`    Image analysis failed or skipped for ${entry.uid}`);
            }
            
            // Small delay to respect OpenAI rate limits
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (imageError) {
            console.error(`    Image analysis failed for ${entry.uid}:`, imageError.message);
          }
        }

        // Generate embedding with combined text and image analysis
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
          console.error(`    Failed to generate embedding for entry ${entry.uid}`);
          failed++;
          continue;
        }

        // Prepare tags
        let tags = [];
        if (entry.tags) {
          if (Array.isArray(entry.tags)) {
            tags = entry.tags.map(tag => {
              if (typeof tag === 'object' && tag !== null) {
                return tag.name || tag.title || tag.uid || String(tag);
              }
              return String(tag);
            }).filter(tag => tag && tag.length > 0);
          } else if (typeof entry.tags === 'string') {
            tags = entry.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
          }
        }

        // Create enhanced metadata with detailed image information
        const metadata = {
          title: entry.title || 'Untitled',
          type: contentType,
          snippet: cleanText.substring(0, 500),
          locale: entry.locale || 'en-us',
          tags: tags,
          date: entry.updated_at || entry.created_at || new Date().toISOString(),
          content_type_uid: entry._content_type_uid || contentType,
          uid: entry.uid,
          url: entry.url || '',
          
          // Enhanced image metadata
          primary_image: imageUrls[0] || null,
          all_images: imageUrls.length > 0 ? imageUrls : null,
          image_count: imageUrls.length,
          has_images: imageUrls.length > 0,
          
          // Image analysis data
          image_analysis: imageAnalysis || null,
          
          // Additional metadata for better search
          category: entry.category || null,
          price: entry.price || null,
          duration: entry.duration || null,
          visual_match: imageAnalysis ? true : false,
          
          // Enhanced searchable content flag
          multimodal_content: imageAnalysis ? true : false
        };

        // Clean up null values to save space
        Object.keys(metadata).forEach(key => {
          if (metadata[key] === null || metadata[key] === undefined) {
            delete metadata[key];
          }
        });

        vectors.push({
          id: `${contentType}_${entry.uid}`,
          values: vector,
          metadata: metadata
        });
        
        processed++;
        
      } catch (error) {
        console.error(`    Error processing entry ${entry.uid}:`, error.message);
        failed++;
      }
    }
    
    // Upsert the batch to Pinecone
    if (vectors.length > 0) {
      try {
        await index.upsert(vectors);
        console.log(`    Successfully upserted ${vectors.length} vectors to Pinecone`);
        
        // Longer delay due to image processing
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`    Failed to upsert batch:`, error.message);
        failed += vectors.length;
        processed -= vectors.length;
      }
    } else {
      console.log(`    No vectors to upsert in this batch`);
    }
  }
  
  console.log(`Completed ${contentType}: ${processed} processed, ${failed} failed, ${skipped} skipped, ${imagesAnalyzed} images analyzed`);
  return { processed, failed, skipped, imagesAnalyzed };
}

// Main sync function
async function syncContentstack() {
  console.log('=== Starting Enhanced Contentstack to Pinecone Sync ===');
  console.log(`Target Pinecone index: ${indexName}`);
  console.log(`Contentstack region: ${process.env.CONTENTSTACK_REGION || 'US (default)'}`);
  console.log(`Environment: ${process.env.CONTENTSTACK_ENVIRONMENT}`);
  console.log(`Image analysis: ${openai ? 'Enabled with gpt-4o-mini' : 'Disabled'}`);
  
  try {
    // Test Pinecone connection
    console.log('\n1. Testing Pinecone connection...');
    const index = pinecone.Index(indexName);
    const stats = await index.describeIndexStats();
    console.log(`   Index stats:`, {
      dimension: stats.dimension,
      totalVectors: stats.totalVectorCount,
      namespaces: Object.keys(stats.namespaces || {})
    });
    
    // Test Contentstack connection and get available content types
    console.log('\n2. Testing Contentstack connection...');
    const availableContentTypes = await testConnectionstack();
    
    if (availableContentTypes.length === 0) {
      throw new Error('No content types found in Contentstack');
    }
    
    // Determine which content types to sync
    const targetContentTypes = ["article", "video", "product", "media"];
    const contentTypesToSync = targetContentTypes.filter(ct => 
      availableContentTypes.some(act => act.uid === ct)
    );
    
    console.log(`\n3. Content types to sync: ${contentTypesToSync.join(', ')}`);
    
    if (contentTypesToSync.length === 0) {
      console.log('   No matching content types found. Available types:');
      availableContentTypes.forEach(ct => console.log(`     - ${ct.uid}`));
      return;
    }
    
    let totalProcessed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let totalImagesAnalyzed = 0;
    
    // Process each content type
    for (const contentType of contentTypesToSync) {
      try {
        console.log(`\n4. Processing content type: ${contentType}`);
        console.log('=' .repeat(50));
        
        const entries = await fetchEntries(contentType);
        
        if (entries.length === 0) {
          console.log(`   No entries found for ${contentType}, skipping...`);
          continue;
        }
        
        const result = await upsertEntries(entries, contentType);
        totalProcessed += result.processed;
        totalFailed += result.failed;
        totalSkipped += result.skipped;
        totalImagesAnalyzed += result.imagesAnalyzed || 0;
        
        console.log(`   ${contentType} summary: ${result.processed} processed, ${result.failed} failed, ${result.skipped} skipped, ${result.imagesAnalyzed || 0} images analyzed`);
        
      } catch (error) {
        console.error(`   Failed to process content type ${contentType}:`, error.message);
        totalFailed++;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('=== ENHANCED SYNC COMPLETE ===');
    console.log(`Total entries processed: ${totalProcessed}`);
    console.log(`Total entries failed: ${totalFailed}`);
    console.log(`Total entries skipped: ${totalSkipped}`);
    console.log(`Total images analyzed: ${totalImagesAnalyzed}`);
    
    if (totalProcessed + totalFailed > 0) {
      const successRate = ((totalProcessed / (totalProcessed + totalFailed)) * 100).toFixed(1);
      console.log(`Success rate: ${successRate}%`);
    }
    
    if (totalProcessed > 0) {
      console.log('\nYour enhanced multimodal search index is now ready!');
      console.log('Features available:');
      console.log('- Semantic text search');
      console.log('- Image-aware search results');
      if (totalImagesAnalyzed > 0) {
        console.log('- AI-powered image analysis and matching');
      }
      console.log('\nTo test:');
      console.log('1. Start your server: npm run dev (in server folder)');
      console.log('2. Start your frontend: npm run dev (in client folder)');
      console.log('3. Try visual search queries like "red sneakers with logo"');
    }
    
  } catch (error) {
    console.error('\nSync failed with error:', error.message);
    
    if (error.message.includes('api_key')) {
      console.log('\nTroubleshooting tips:');
      console.log('- Verify your CONTENTSTACK_API_KEY in .env');
      console.log('- Make sure you are using the Stack API Key, not Management API Key');
      console.log('- Check that CONTENTSTACK_REGION matches your stack region');
    }
    
    process.exit(1);
  }
}

// Run sync
console.log('Starting enhanced sync process...\n');

syncContentstack()
  .then(() => {
    console.log('\nEnhanced sync process completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nEnhanced sync process failed:', error);
    process.exit(1);
  });