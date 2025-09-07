import React, { useState, useEffect } from 'react';
import { Search, Filter, Settings, FileText, Image, Video, Star, Calendar, Brain, Target, Zap, TrendingUp, AlertCircle, Wifi, WifiOff, Eye, ImageIcon, Sparkles, ExternalLink, Tag } from 'lucide-react';

const EnhancedSemanticSearchApp = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedContentTypes, setSelectedContentTypes] = useState([]);
  const [selectedLocales, setSelectedLocales] = useState(['en-us']);
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState(null);
  const [serverStatus, setServerStatus] = useState('checking');
  const [searchContext, setSearchContext] = useState(null);

  // Updated API Base URL - Change this to your deployed Vercel URL
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ;

  // Check server status on component mount
  useEffect(() => {
    checkServerStatus();
  }, []);

  const checkServerStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      if (response.ok) {
        const data = await response.json();
        setServerStatus('online');
        setError(null);
        console.log('Server status:', data);
      } else {
        setServerStatus('offline');
        setError(`Server responded with status ${response.status}. Please check your backend deployment.`);
      }
    } catch (error) {
      setServerStatus('offline');
      setError('Cannot connect to search server. Please make sure your backend is deployed and the URL is correct.');
      console.error('Server connection error:', error);
    }
  };

  const contentTypes = [
    { id: 'article', name: 'Articles', icon: FileText, count: 245 },
    { id: 'product', name: 'Products', icon: Star, count: 128 },
    { id: 'media', name: 'Media', icon: Image, count: 89 },
    { id: 'video', name: 'Videos', icon: Video, count: 34 }
  ];

  const locales = [
    { code: 'en-us', name: 'English (US)', flag: '🇺🇸' },
    { code: 'es-es', name: 'Spanish (ES)', flag: '🇪🇸' },
    { code: 'fr-fr', name: 'French (FR)', flag: '🇫🇷' },
    { code: 'de-de', name: 'German (DE)', flag: '🇩🇪' }
  ];

  const visualSearchExamples = [
    'red sneaker with white logo',
    'blue product packaging',
    'round container with text',
    'striped pattern clothing',
    'colorful design with symbols',
    'leather shoes brown',
    'green bottle with label'
  ];

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setError('Please enter a search query');
      return;
    }

    if (serverStatus === 'offline') {
      setError('Search server is offline. Please check your backend connection.');
      return;
    }

    setIsSearching(true);
    setShowResults(true);
    setError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // Increased timeout for serverless functions

      const requestBody = {
        query: searchQuery.trim(),
        contentTypes: selectedContentTypes.length > 0 ? selectedContentTypes : undefined,
        locales: selectedLocales.length > 0 ? selectedLocales : undefined,
      };

      console.log('Making search request to:', `${API_BASE_URL}/search`);
      console.log('Request body:', requestBody);

      const response = await fetch(`${API_BASE_URL}/search`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Server error' }));
        throw new Error(errorData.error || `Search failed with status ${response.status}`);
      }

      const data = await response.json();
      console.log('Search response:', data);
      
      if (!data || !Array.isArray(data.results)) {
        throw new Error('Invalid response format from server');
      }

      setSearchResults(data.results);
      setSearchContext(data.searchContext);
      
      if (data.results.length === 0) {
        setError('No results found. Try a different search query or check if content has been synced.');
      }

    } catch (searchError) {
      console.error('Search failed:', searchError);
      
      if (searchError.name === 'AbortError') {
        setError('Search request timed out. Serverless functions may take longer to respond on first request.');
      } else if (searchError.message.includes('fetch') || searchError.message.includes('NetworkError')) {
        setError('Cannot connect to search server. Please verify your backend URL and deployment status.');
        setServerStatus('offline');
      } else {
        setError(searchError.message || 'Search failed. Please try again.');
      }
      
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const toggleContentType = (typeId) => {
    setSelectedContentTypes(prev => 
      prev.includes(typeId) 
        ? prev.filter(id => id !== typeId)
        : [...prev, typeId]
    );
  };

  const toggleLocale = (localeCode) => {
    setSelectedLocales(prev => 
      prev.includes(localeCode) 
        ? prev.filter(code => code !== localeCode)
        : [...prev, localeCode]
    );
  };

  const getSimilarityColor = (score) => {
    if (score >= 0.9) return 'text-green-600 bg-green-50';
    if (score >= 0.8) return 'text-blue-600 bg-blue-50';
    if (score >= 0.7) return 'text-yellow-600 bg-yellow-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getContentTypeIcon = (type) => {
    const contentType = contentTypes.find(ct => ct.id === type);
    return contentType ? contentType.icon : FileText;
  };

  const handleExampleClick = (example) => {
    setSearchQuery(example);
    setError(null);
  };

  // Helper function to format price
  const formatPrice = (price) => {
    if (!price) return null;
    return `$${parseFloat(price).toFixed(2)}`;
  };

  // Helper function to format duration
  const formatDuration = (duration) => {
    if (!duration) return null;
    return `${duration} min`;
  };

  // Helper function to ensure image URL is absolute
  const getFullImageUrl = (imageUrl) => {
    if (!imageUrl) return null;
    if (imageUrl.startsWith('http')) return imageUrl;
    // If it's a Contentstack URL, ensure it has https
    if (imageUrl.includes('contentstack.io')) {
      return imageUrl.startsWith('//') ? `https:${imageUrl}` : `https://${imageUrl}`;
    }
    return imageUrl;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-semibold text-gray-900">Enhanced Semantic Search</h1>
              </div>
              <div className="hidden sm:flex items-center space-x-1 bg-gradient-to-r from-blue-50 to-purple-50 text-blue-700 px-3 py-1 rounded-full text-sm">
                <Eye className="w-4 h-4" />
                <span>Multimodal AI</span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {/* Server Status Indicator */}
              <div className="flex items-center space-x-2">
                {serverStatus === 'online' ? (
                  <div className="flex items-center space-x-1 text-green-600">
                    <Wifi className="w-4 h-4" />
                    <span className="text-xs">Online</span>
                  </div>
                ) : serverStatus === 'offline' ? (
                  <div className="flex items-center space-x-1 text-red-600">
                    <WifiOff className="w-4 h-4" />
                    <span className="text-xs">Offline</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1 text-yellow-600">
                    <div className="w-4 h-4 animate-spin border border-yellow-600 border-t-transparent rounded-full"></div>
                    <span className="text-xs">Checking...</span>
                  </div>
                )}
              </div>
              <button 
                onClick={() => checkServerStatus()}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Refresh server status"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mx-6 mt-4 rounded-r-lg">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-400 mr-3" />
            <div>
              <p className="text-sm text-red-700">{error}</p>
              {serverStatus === 'offline' && (
                <div className="mt-2 space-y-1">
                  <button 
                    onClick={checkServerStatus}
                    className="text-xs text-red-600 hover:text-red-800 underline block"
                  >
                    Retry connection
                  </button>
                  <p className="text-xs text-red-600">
                    Current backend URL: {API_BASE_URL}
                  </p>
                </div>
              )}
            </div>
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Enhanced Search Context Banner */}
      {searchContext && showResults && (
        <div className={`mx-6 mt-4 p-4 rounded-lg ${
          searchContext.isVisualQuery 
            ? 'bg-purple-50 border-l-4 border-purple-400' 
            : 'bg-blue-50 border-l-4 border-blue-400'
        }`}>
          <div className="flex items-center space-x-3">
            {searchContext.isVisualQuery ? (
              <Eye className="w-5 h-5 text-purple-600" />
            ) : (
              <Brain className="w-5 h-5 text-blue-600" />
            )}
            <div className="flex-1">
              <p className={`text-sm font-medium ${
                searchContext.isVisualQuery ? 'text-purple-800' : 'text-blue-800'
              }`}>
                {searchContext.isVisualQuery 
                  ? `Visual Query Detected (${Math.round(searchContext.visualConfidence * 100)}% confidence)`
                  : 'Text-based Semantic Search'
                }
              </p>
              <p className={`text-xs ${
                searchContext.isVisualQuery ? 'text-purple-600' : 'text-blue-600'
              }`}>
                {searchContext.isVisualQuery 
                  ? `Found ${searchContext.multimodalResultsCount} results with images • ${searchContext.analyzedImageCount} with AI-analyzed content • ${searchContext.totalImagesFound} total images`
                  : 'Analyzing content meaning and context'
                }
              </p>
              {searchContext.matchedVisualKeywords && searchContext.matchedVisualKeywords.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {searchContext.matchedVisualKeywords.slice(0, 5).map((keyword, keywordIdx) => (
                    <span key={keywordIdx} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                      {keyword}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Search Section */}
          <div className="lg:col-span-3">
            {/* Search Input */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex items-center space-x-4 mb-4">
                <Target className="w-6 h-6 text-blue-600" />
                <h2 className="text-lg font-medium text-gray-900">Multimodal Content Search</h2>
                <div className="flex items-center space-x-1 bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs">
                  <Sparkles className="w-3 h-3" />
                  <span>AI Vision</span>
                </div>
              </div>
              
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (error) setError(null);
                  }}
                  onKeyPress={handleKeyPress}
                  placeholder="Try: 'red sneakers with white logo' or 'blue product packaging'"
                  className="block w-full pl-12 pr-4 py-4 border border-gray-300 rounded-lg text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={serverStatus === 'offline'}
                />
                <button
                  onClick={handleSearch}
                  disabled={!searchQuery.trim() || isSearching || serverStatus === 'offline'}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center"
                >
                  <div className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    searchQuery.trim() && !isSearching && serverStatus === 'online'
                      ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}>
                    {isSearching ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Searching...</span>
                      </div>
                    ) : (
                      'Search'
                    )}
                  </div>
                </button>
              </div>
              
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center text-sm text-gray-500">
                  <Brain className="w-4 h-4 mr-1" />
                  <span>AI understands both text content and visual elements</span>
                </div>
                <div className="flex items-center text-xs text-purple-600">
                  <ImageIcon className="w-3 h-3 mr-1" />
                  <span>Image analysis enabled</span>
                </div>
              </div>
              
              {/* Visual Search Examples */}
              <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                  <Eye className="w-4 h-4 mr-2" />
                  Try these visual search examples:
                </h4>
                <div className="flex flex-wrap gap-2">
                  {visualSearchExamples.map((example, exampleIdx) => (
                    <button
                      key={exampleIdx}
                      onClick={() => handleExampleClick(example)}
                      className="px-3 py-1 text-xs bg-white border border-purple-200 rounded-full hover:bg-purple-50 hover:border-purple-300 transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              {/* Backend URL Display */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Backend URL:</span>
                  <span className="text-xs font-mono text-gray-800">{API_BASE_URL}</span>
                </div>
              </div>
            </div>

            {/* Results Section */}
            {showResults && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-900">
                      Search Results
                      {!isSearching && searchResults.length > 0 && (
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          ({searchResults.length} results)
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <div className="flex items-center space-x-1">
                        <TrendingUp className="w-4 h-4" />
                        <span>Ranked by similarity</span>
                      </div>
                      {searchContext?.hasMultimodalResults && (
                        <div className="flex items-center space-x-1 text-purple-600">
                          <ImageIcon className="w-4 h-4" />
                          <span>{searchContext.multimodalResultsCount} with images</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {isSearching ? (
                  <div className="p-8">
                    <div className="flex flex-col items-center justify-center space-y-4">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
                      <p className="text-gray-500">Analyzing content with multimodal AI...</p>
                      <p className="text-xs text-gray-400">First request may take longer on serverless functions</p>
                    </div>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="divide-y divide-gray-200">
                    {searchResults.map((result) => {
                      const IconComponent = getContentTypeIcon(result.contentType || result.type);
                      return (
                        <div key={result.id} className="p-6 hover:bg-gray-50 transition-colors">
                          <div className="flex items-start space-x-4">
                            <div className="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                              <IconComponent className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-3 mb-2 flex-wrap">
                                <h4 className="text-lg font-medium text-gray-900 truncate">
                                  {result.title}
                                </h4>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSimilarityColor(result.similarity || result.relevance)}`}>
                                  {Math.round((result.similarity || result.relevance) * 100)}% match
                                </span>
                                {result.hasImages && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">
                                    <ImageIcon className="w-3 h-3 mr-1" />
                                    {result.imageCount > 1 ? `${result.imageCount} Images` : 'Image'}
                                  </span>
                                )}
                                {result.visualQueryMatch && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                                    <Eye className="w-3 h-3 mr-1" />
                                    Visual Match
                                  </span>
                                )}
                                {result.imageAnalyzed && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
                                    <Sparkles className="w-3 h-3 mr-1" />
                                    AI Analyzed
                                  </span>
                                )}
                              </div>
                              
                              {/* Enhanced Image Display */}
                              {(result.primaryImage || result.primary_image) && (
                                <div className="mb-4">
                                  <div className="flex items-start space-x-3">
                                    <img 
                                      src={getFullImageUrl(result.primaryImage || result.primary_image)} 
                                      alt={result.title}
                                      className="w-40 h-32 object-cover rounded-lg border border-gray-200 shadow-sm"
                                      onError={(e) => {
                                        e.target.style.display = 'none';
                                      }}
                                    />
                                    {(result.allImages || result.all_images) && (result.allImages || result.all_images).length > 1 && (
                                      <div className="flex flex-col space-y-2">
                                        {(result.allImages || result.all_images).slice(1, 4).map((imageUrl, imgIdx) => (
                                          <img
                                            key={imgIdx}
                                            src={getFullImageUrl(imageUrl)}
                                            alt={`${result.title} ${imgIdx + 2}`}
                                            className="w-16 h-12 object-cover rounded border border-gray-200"
                                            onError={(e) => {
                                              e.target.style.display = 'none';
                                            }}
                                          />
                                        ))}
                                        {(result.imageCount || result.image_count) > 4 && (
                                          <div className="w-16 h-12 bg-gray-100 rounded border border-gray-200 flex items-center justify-center">
                                            <span className="text-xs text-gray-500">+{(result.imageCount || result.image_count) - 4}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              <p className="text-gray-600 mb-3 line-clamp-3">
                                {result.snippet}
                              </p>
                              
                              {/* Enhanced metadata display */}
                              <div className="flex items-center space-x-4 text-sm text-gray-500 flex-wrap gap-y-1">
                                <span className="capitalize">{result.contentType || result.type}</span>
                                <span>•</span>
                                <span>{(result.locale || 'en-us').toUpperCase()}</span>
                                <span>•</span>
                                <div className="flex items-center space-x-1">
                                  <Calendar className="w-4 h-4" />
                                  <span>{result.lastModified || result.date}</span>
                                </div>
                                {result.price && (
                                  <>
                                    <span>•</span>
                                    <span className="font-medium text-green-600">{formatPrice(result.price)}</span>
                                  </>
                                )}
                                {result.duration && (
                                  <>
                                    <span>•</span>
                                    <span>{formatDuration(result.duration)}</span>
                                  </>
                                )}
                                {result.category && (
                                  <>
                                    <span>•</span>
                                    <span className="text-blue-600">{result.category}</span>
                                  </>
                                )}
                              </div>
                              
                              {/* Tags */}
                              {result.tags && result.tags.length > 0 && (
                                <div className="flex items-center space-x-2 mt-3 flex-wrap">
                                  <Tag className="w-3 h-3 text-gray-400" />
                                  {result.tags.slice(0, 4).map((tag, tagIdx) => (
                                    <span key={tagIdx} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 cursor-pointer">
                                      {tag}
                                    </span>
                                  ))}
                                  {result.tags.length > 4 && (
                                    <span className="text-xs text-gray-500">+{result.tags.length - 4} more</span>
                                  )}
                                </div>
                              )}
                              
                              {/* Action buttons */}
                              {result.url && (
                                <div className="mt-4">
                                  <a
                                    href={result.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                                  >
                                    <ExternalLink className="w-3 h-3 mr-1" />
                                    View Content
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
                    <p className="text-gray-500 mb-4">
                      Try different search terms or make sure content has been synced from Contentstack.
                    </p>
                    <button 
                      onClick={() => setShowResults(false)}
                      className="text-blue-600 hover:text-blue-700 text-sm"
                    >
                      Try a new search
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {!showResults && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Eye className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Discover Content with Multimodal AI</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Enter a natural language query to find relevant content based on both text meaning and visual elements.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                  <div className="bg-blue-50 rounded-lg p-4 text-left">
                    <div className="flex items-center mb-2">
                      <Brain className="w-4 h-4 text-blue-600 mr-2" />
                      <div className="text-sm font-medium text-gray-900">Text Search:</div>
                    </div>
                    <div className="text-sm text-gray-600">"sustainable fashion articles"</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4 text-left">
                    <div className="flex items-center mb-2">
                      <Eye className="w-4 h-4 text-purple-600 mr-2" />
                      <div className="text-sm font-medium text-gray-900">Visual Search:</div>
                    </div>
                    <div className="text-sm text-gray-600">"red shoes with logo"</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Enhanced Filters Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-24">
              <div className="flex items-center space-x-2 mb-6">
                <Filter className="w-5 h-5 text-gray-600" />
                <h3 className="text-lg font-medium text-gray-900">Filters</h3>
              </div>

              {/* Content Types */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Content Types</h4>
                <div className="space-y-2">
                  {contentTypes.map((type) => {
                    const IconComponent = type.icon;
                    return (
                      <label key={type.id} className="flex items-center space-x-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedContentTypes.includes(type.id)}
                          onChange={() => toggleContentType(type.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex items-center space-x-2 flex-1">
                          <IconComponent className="w-4 h-4 text-gray-500 group-hover:text-gray-700" />
                          <span className="text-sm text-gray-700 group-hover:text-gray-900">{type.name}</span>
                        </div>
                        <span className="text-xs text-gray-500">{type.count}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Locales */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Locales</h4>
                <div className="space-y-2">
                  {locales.map((locale) => (
                    <label key={locale.code} className="flex items-center space-x-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedLocales.includes(locale.code)}
                        onChange={() => toggleLocale(locale.code)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex items-center space-x-2 flex-1">
                        <span className="text-sm">{locale.flag}</span>
                        <span className="text-sm text-gray-700 group-hover:text-gray-900">{locale.name}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Enhanced Features Info */}
              <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 mb-2 flex items-center">
                  <Sparkles className="w-4 h-4 mr-2 text-purple-600" />
                  AI Features
                </h4>
                <div className="space-y-2 text-xs text-gray-600">
                  <div className="flex items-center space-x-2">
                    <Eye className="w-3 h-3 text-purple-500" />
                    <span>Image content analysis</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Brain className="w-3 h-3 text-blue-500" />
                    <span>Context understanding</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Zap className="w-3 h-3 text-yellow-500" />
                    <span>Visual query detection</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <ImageIcon className="w-3 h-3 text-green-500" />
                    <span>Multimodal search</span>
                  </div>
                </div>
              </div>

              {/* Search Stats */}
              {searchContext && (
                <div className="mb-6 p-3 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Search Stats</h4>
                  <div className="space-y-1 text-xs text-gray-600">
                    <div className="flex justify-between">
                      <span>Results with images:</span>
                      <span className="font-medium">{searchContext.multimodalResultsCount || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>AI analyzed:</span>
                      <span className="font-medium">{searchContext.analyzedImageCount || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total images:</span>
                      <span className="font-medium">{searchContext.totalImagesFound || 0}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Clear Filters */}
              <button
                onClick={() => {
                  setSelectedContentTypes([]);
                  setSelectedLocales(['en-us']);
                }}
                className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg border border-gray-300 transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedSemanticSearchApp;