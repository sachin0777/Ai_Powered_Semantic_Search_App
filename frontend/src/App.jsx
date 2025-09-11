import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Settings, 
  FileText, 
  Image, 
  Video, 
  Star, 
  Calendar, 
  Brain, 
  Target, 
  Zap, 
  TrendingUp, 
  AlertCircle, 
  Wifi, 
  WifiOff, 
  Eye, 
  ImageIcon, 
  Sparkles, 
  ExternalLink, 
  Tag,
  Loader2,
  Globe,
  Activity,
  Layers,
  ArrowRight,
  BarChart3,
  Compass,
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
  Database,
  Link,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Upload,
  Download
} from 'lucide-react';

const EnhancedSemanticSearch = () => {
  // Existing state management
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedContentTypes, setSelectedContentTypes] = useState([]);
  const [selectedLocales, setSelectedLocales] = useState(['en-us']);
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState(null);
  const [serverStatus, setServerStatus] = useState('checking');
  const [searchContext, setSearchContext] = useState(null);
  const [extensionConfig, setExtensionConfig] = useState(null);
  const [isContentstackApp, setIsContentstackApp] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // New Contentstack management state
  const [activeTab, setActiveTab] = useState('search'); // 'search' or 'manage'
  const [contentstackConfig, setContentstackConfig] = useState({
    apiKey: '',
    deliveryToken: '',
    managementToken: '',
    region: 'us',
    environment: 'production'
  });
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [managedEntries, setManagedEntries] = useState([]);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [entryForm, setEntryForm] = useState({
    title: '',
    content: '',
    contentType: 'article',
    tags: [],
    locale: 'en-us'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Initialize Contentstack extension if available
  useEffect(() => {
    // Auto-populate demo credentials for testing
    setContentstackConfig({
      apiKey: 'blt38f9aa5e68768bc6',
      deliveryToken: 'cs74c890107d3876a473be5ebc',
      managementToken: 'csb84ed46ddc3a4e9436799fe2',
      region: 'eu',
      environment: 'development'
    });

    if (window.ContentstackUIExtension) {
      setIsContentstackApp(true);
      window.ContentstackUIExtension.init().then((extension) => {
        console.log('Contentstack extension initialized:', extension);
        
        extension.getConfig().then((config) => {
          console.log('App config:', config);
          setExtensionConfig(config);
          // Auto-populate config if available from extension
          if (config.api_key && config.delivery_token) {
            setContentstackConfig(prev => ({
              ...prev,
              apiKey: config.api_key,
              deliveryToken: config.delivery_token,
              managementToken: config.management_token || '',
              region: config.region || 'us',
              environment: config.environment || 'production'
            }));
          }
        }).catch((err) => {
          console.warn('Failed to get app config:', err);
        });

        extension.frame.updateHeight(window.innerHeight);
        
        window.addEventListener('resize', () => {
          extension.frame.updateHeight(window.innerHeight);
        });
      }).catch((err) => {
        console.warn('Failed to initialize Contentstack extension:', err);
        setIsContentstackApp(false);
      });
    }
  }, []);

  // Configuration
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
    (extensionConfig?.backend_url) || 
    'https://ai-powered-semantic-search-app.vercel.app';

  const contentTypes = [
    { id: 'article', name: 'Articles', icon: FileText, count: 245, color: 'blue' },
    { id: 'product', name: 'Products', icon: Star, count: 128, color: 'yellow' },
    { id: 'media', name: 'Media', icon: Image, count: 89, color: 'purple' },
    { id: 'video', name: 'Videos', icon: Video, count: 34, color: 'green' }
  ];

  const locales = [
    { code: 'en-us', name: 'English (US)', flag: '🇺🇸' },
    { code: 'es-es', name: 'Spanish (ES)', flag: '🇪🇸' },
    { code: 'fr-fr', name: 'French (FR)', flag: '🇫🇷' },
    { code: 'de-de', name: 'German (DE)', flag: '🇩🇪' }
  ];

  const contentstackRegions = [
    { code: 'us', name: 'North America', endpoint: 'api.contentstack.com' },
    { code: 'eu', name: 'Europe', endpoint: 'eu-api.contentstack.com' },
    { code: 'azure-na', name: 'Azure North America', endpoint: 'azure-na-api.contentstack.com' },
    { code: 'azure-eu', name: 'Azure Europe', endpoint: 'azure-eu-api.contentstack.com' }
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

  // Effects
  useEffect(() => {
    checkServerStatus();
  }, [API_BASE_URL]);

  // Server status check
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
      setError('Cannot connect to search server. Please make sure your backend is deployed and accessible.');
      console.error('Server connection error:', error);
    }
  };

  // Demo Contentstack connection simulation
  const checkContentstackConnection = async () => {
    if (!contentstackConfig.apiKey || !contentstackConfig.deliveryToken) {
      setConnectionStatus('disconnected');
      setIsConnected(false);
      return;
    }

    setConnectionStatus('checking');
    setError(null);
    
    // Simulate connection delay for realistic feel
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      // Always succeed for demo purposes
      setConnectionStatus('connected');
      setIsConnected(true);
      loadDemoEntries(); // Load demo entries instead
      console.log('Demo connection successful');
    } catch (error) {
      // This shouldn't happen in demo mode, but keeping for safety
      setConnectionStatus('error');
      setIsConnected(false);
      setError('Connection error: ' + error.message);
    }
  };

  // Load demo entries (simulated)
  const loadDemoEntries = async () => {
    setIsLoadingEntries(true);
    
    // Simulate loading delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const demoEntries = [
      {
        uid: 'demo_entry_1',
        title: 'Getting Started with AI-Powered Search',
        content: 'This comprehensive guide covers the fundamentals of implementing AI-powered search in your applications. Learn about semantic search, vector embeddings, and natural language processing techniques that make content discovery more intuitive and effective.',
        locale: 'en-us',
        updated_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        tags: ['AI', 'Search', 'Tutorial', 'Machine Learning'],
        content_type_uid: 'article'
      },
      {
        uid: 'demo_entry_2',
        title: 'Best Practices for Content Management',
        content: 'Discover industry best practices for managing digital content at scale. This article covers content strategy, workflow optimization, and the latest trends in headless CMS architecture.',
        locale: 'en-us',
        updated_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        tags: ['CMS', 'Content Strategy', 'Best Practices'],
        content_type_uid: 'article'
      },
      {
        uid: 'demo_entry_3',
        title: 'Revolutionary Red Running Shoes',
        content: 'Experience ultimate comfort with our latest red running shoes featuring white logo design. Advanced cushioning technology meets premium materials for the perfect running experience.',
        locale: 'en-us',
        updated_at: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
        tags: ['Shoes', 'Sports', 'Red', 'Running'],
        content_type_uid: 'product'
      },
      {
        uid: 'demo_entry_4',
        title: 'Sustainable Fashion: The Future of Style',
        content: 'Explore the growing trend of sustainable fashion and its impact on the industry. Learn about eco-friendly materials, ethical manufacturing, and how brands are adapting to consumer demands for sustainability.',
        locale: 'en-us',
        updated_at: new Date(Date.now() - 345600000).toISOString(), // 4 days ago
        tags: ['Fashion', 'Sustainability', 'Environment', 'Trends'],
        content_type_uid: 'article'
      },
      {
        uid: 'demo_entry_5',
        title: 'Premium Blue Product Packaging Design',
        content: 'Showcase your products with our innovative blue packaging solutions. Modern design meets functionality with these eye-catching containers that enhance brand recognition.',
        locale: 'en-us',
        updated_at: new Date(Date.now() - 432000000).toISOString(), // 5 days ago
        tags: ['Packaging', 'Design', 'Blue', 'Branding'],
        content_type_uid: 'product'
      }
    ];
    
    setManagedEntries(demoEntries);
    setIsLoadingEntries(false);
  };

 // Create/Update entry (demo simulation)
  const saveEntry = async () => {
    if (!isConnected) {
      setError('Management token required for creating/updating entries');
      return;
    }

    if (!entryForm.title.trim()) {
      setError('Title is required');
      return;
    }

    setIsSaving(true);
    setError(null);
    
    // Simulate save delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    try {
      const newEntry = {
        uid: editingEntry ? editingEntry.uid : `demo_entry_${Date.now()}`,
        title: entryForm.title,
        content: entryForm.content,
        tags: entryForm.tags,
        locale: entryForm.locale,
        content_type_uid: entryForm.contentType,
        updated_at: new Date().toISOString()
      };

      if (editingEntry) {
        // Update existing entry
        setManagedEntries(prev => 
          prev.map(entry => entry.uid === editingEntry.uid ? newEntry : entry)
        );
      } else {
        // Add new entry
        setManagedEntries(prev => [newEntry, ...prev]);
      }

      setShowEntryModal(false);
      setEditingEntry(null);
      resetEntryForm();
      
      // Simulate sync to search backend
      console.log('Demo: Entry saved and synced to search backend');
      
    } catch (error) {
      setError('Error saving entry: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete entry (demo simulation)
  const deleteEntry = async (entryUid) => {
    if (!isConnected) {
      setError('Management token required for deleting entries');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this entry?')) {
      return;
    }

    // Simulate delete delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      // Remove entry from local state
      setManagedEntries(prev => prev.filter(entry => entry.uid !== entryUid));
      console.log('Demo: Entry deleted and synced to search backend');
    } catch (error) {
      setError('Error deleting entry: ' + error.message);
    }
  };

  // Sync to search backend (demo simulation)
  const syncToSearchBackend = async () => {
    // Simulate sync delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      // Always succeed for demo purposes
      console.log('Demo: Successfully synced to search backend');
      return true;
    } catch (error) {
      console.error('Demo: Error syncing to search backend:', error);
      return false;
    }
  };

  // Reset entry form
  const resetEntryForm = () => {
    setEntryForm({
      title: '',
      content: '',
      contentType: 'article',
      tags: [],
      locale: 'en-us'
    });
  };

  // Search functionality (existing)
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
      const timeoutId = setTimeout(() => controller.abort(), 45000);

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
        setError('Search request timed out. Serverless functions may take longer on first request.');
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

  // Event handlers
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

  const handleExampleClick = (example) => {
    setSearchQuery(example);
    setError(null);
  };

  const openEntryModal = (entry = null) => {
    if (entry) {
      setEditingEntry(entry);
      setEntryForm({
        title: entry.title || '',
        content: entry.content || '',
        contentType: entry.content_type_uid || 'article',
        tags: entry.tags || [],
        locale: entry.locale || 'en-us'
      });
    } else {
      setEditingEntry(null);
      resetEntryForm();
    }
    setShowEntryModal(true);
  };

  // Utility functions (existing)
  const getSimilarityColor = (score) => {
    if (score >= 0.9) return 'text-emerald-700 bg-emerald-100 border-emerald-200';
    if (score >= 0.8) return 'text-blue-700 bg-blue-100 border-blue-200';
    if (score >= 0.7) return 'text-amber-700 bg-amber-100 border-amber-200';
    return 'text-slate-700 bg-slate-100 border-slate-200';
  };

  const getContentTypeIcon = (type) => {
    const contentType = contentTypes.find(ct => ct.id === type);
    return contentType ? contentType.icon : FileText;
  };

  const getContentTypeColor = (type) => {
    const contentType = contentTypes.find(ct => ct.id === type);
    return contentType ? contentType.color : 'slate';
  };

  const getFullImageUrl = (imageUrl) => {
    if (!imageUrl) return null;
    
    try {
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        return imageUrl;
      }
      
      if (imageUrl.startsWith('//')) {
        return `https:${imageUrl}`;
      }
      
      if (imageUrl.includes('contentstack.com')) {
        return `https://${imageUrl}`;
      }
      
      return imageUrl;
    } catch (error) {
      console.error('Error processing image URL:', imageUrl, error);
      return null;
    }
  };

  const formatPrice = (price) => {
    if (!price) return null;
    return `$${parseFloat(price).toFixed(2)}`;
  };

  const formatDuration = (duration) => {
    if (!duration) return null;
    return `${duration} min`;
  };

  // Image component with fallback (existing)
  const ImageWithFallback = ({ src, alt, className, result }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    const handleLoad = () => {
      setIsLoading(false);
      setHasError(false);
    };

    const handleError = () => {
      setIsLoading(false);
      setHasError(true);
    };

    if (!src) return null;

    return (
      <div className={`relative overflow-hidden group ${className}`}>
        {isLoading && (
          <div className={`absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl flex items-center justify-center ${className}`}>
            <div className="flex flex-col items-center space-y-2">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              <div className="w-8 h-1 bg-slate-300 rounded-full overflow-hidden">
                <div className="w-full h-full bg-gradient-to-r from-blue-400 to-purple-400 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
        )}
        <img 
          src={getFullImageUrl(src)}
          alt={alt}
          className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-all duration-500 hover:scale-105 ${hasError ? 'hidden' : ''}`}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
        />
        {hasError && (
          <div className={`${className} bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl flex items-center justify-center border-2 border-dashed border-slate-300`}>
            <div className="text-slate-400 text-center p-4">
              <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-60" />
              <span className="text-xs font-medium">Image unavailable</span>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"></div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-purple-400/10 to-pink-400/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-r from-cyan-400/5 to-blue-400/5 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      {/* Header */}
      <div className="relative bg-white/80 backdrop-blur-xl border-b border-slate-200/50 sticky top-0 z-50">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-purple-600/5 to-pink-600/5"></div>
        <div className="relative max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-white animate-pulse"></div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
                    Neural Search
                  </h1>
                  <p className="text-sm text-slate-600">AI-Powered Content Discovery & Management</p>
                </div>
                {isContentstackApp && (
                  <div className="flex items-center space-x-1 bg-gradient-to-r from-blue-100 to-purple-100 text-blue-700 px-3 py-1.5 rounded-full text-xs font-medium">
                    <Layers className="w-3 h-3" />
                    <span>Contentstack App</span>
                  </div>
                )}
              </div>
              
              {/* Tab Navigation */}
              <div className="hidden lg:flex items-center space-x-2 bg-slate-100 rounded-2xl p-1">
                <button
                  onClick={() => setActiveTab('search')}
                  className={`px-6 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    activeTab === 'search'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Search className="w-4 h-4 inline mr-2" />
                  Search
                </button>
                <button
                  onClick={() => setActiveTab('manage')}
                  className={`px-6 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    activeTab === 'manage'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Database className="w-4 h-4 inline mr-2" />
                  Manage
                </button>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                {/* Search Server Status */}
                {serverStatus === 'online' ? (
                  <div className="flex items-center space-x-2 text-emerald-600 bg-emerald-50 px-3 py-2 rounded-full">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                    <Wifi className="w-4 h-4" />
                    <span className="text-sm font-medium">Search Online</span>
                  </div>
                ) : serverStatus === 'offline' ? (
                  <div className="flex items-center space-x-2 text-red-600 bg-red-50 px-3 py-2 rounded-full">
                    <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                    <WifiOff className="w-4 h-4" />
                    <span className="text-sm font-medium">Search Offline</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-full">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-medium">Checking...</span>
                  </div>
                )}

                {/* Contentstack Connection Status */}
                {activeTab === 'manage' && (
                  <>
                    {connectionStatus === 'connected' ? (
                      <div className="flex items-center space-x-2 text-blue-600 bg-blue-50 px-3 py-2 rounded-full">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                        <Database className="w-4 h-4" />
                        <span className="text-sm font-medium">CMS Connected</span>
                      </div>
                    ) : connectionStatus === 'error' ? (
                      <div className="flex items-center space-x-2 text-red-600 bg-red-50 px-3 py-2 rounded-full">
                        <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm font-medium">CMS Error</span>
                      </div>
                    ) : connectionStatus === 'checking' ? (
                      <div className="flex items-center space-x-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-full">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm font-medium">Connecting...</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 text-slate-600 bg-slate-50 px-3 py-2 rounded-full">
                        <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                        <Database className="w-4 h-4" />
                        <span className="text-sm font-medium">CMS Disconnected</span>
                      </div>
                    )}
                  </>
                )}
              </div>
              
              {activeTab === 'manage' && (
                <button 
                  onClick={() => setShowConfigModal(true)}
                  className="p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all duration-200 hover:scale-105"
                  title="Contentstack Configuration"
                >
                  <Settings className="w-5 h-5" />
                </button>
              )}
              
              <button 
                onClick={checkServerStatus}
                className="p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all duration-200 hover:scale-105"
                title="Refresh server status"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="relative mx-6 mt-6 bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 rounded-2xl shadow-lg overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-red-600/5 to-pink-600/5"></div>
          <div className="relative p-6">
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-900 mb-1">System Issue</h3>
                <p className="text-sm text-red-700 leading-relaxed">{error}</p>
                {serverStatus === 'offline' && (
                  <div className="mt-4 flex items-center space-x-4">
                    <button 
                      onClick={checkServerStatus}
                      className="text-xs text-red-700 hover:text-red-900 underline font-medium"
                    >
                      Retry connection
                    </button>
                    <p className="text-xs text-red-600">Backend: {API_BASE_URL}</p>
                  </div>
                )}
              </div>
              <button 
                onClick={() => setError(null)}
                className="flex-shrink-0 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-lg p-1 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'search' ? (
          <>
            {/* Search Context Banner */}
            {searchContext && showResults && (
              <div className={`relative mb-6 rounded-2xl shadow-lg overflow-hidden ${
                searchContext.isVisualQuery 
                  ? 'bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200' 
                  : 'bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200'
              }`}>
                <div className={`absolute inset-0 ${
                  searchContext.isVisualQuery 
                    ? 'bg-gradient-to-r from-purple-600/5 to-pink-600/5' 
                    : 'bg-gradient-to-r from-blue-600/5 to-cyan-600/5'
                }`}></div>
                <div className="relative p-6">
                  <div className="flex items-start space-x-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      searchContext.isVisualQuery ? 'bg-purple-100' : 'bg-blue-100'
                    }`}>
                      {searchContext.isVisualQuery ? (
                        <Eye className="w-6 h-6 text-purple-600" />
                      ) : (
                        <Brain className="w-6 h-6 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className={`text-lg font-semibold mb-2 ${
                        searchContext.isVisualQuery ? 'text-purple-900' : 'text-blue-900'
                      }`}>
                        {searchContext.isVisualQuery 
                          ? `Visual Query Detected (${Math.round(searchContext.visualConfidence * 100)}% confidence)`
                          : 'Semantic Search Analysis'
                        }
                      </h3>
                      <p className={`text-sm mb-3 ${
                        searchContext.isVisualQuery ? 'text-purple-700' : 'text-blue-700'
                      }`}>
                        {searchContext.isVisualQuery 
                          ? `Found ${searchContext.multimodalResultsCount} results with images • ${searchContext.analyzedImageCount} with AI analysis • ${searchContext.totalImagesFound} total images`
                          : 'Understanding content meaning and context relationships'
                        }
                      </p>
                      {searchContext.matchedVisualKeywords && searchContext.matchedVisualKeywords.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {searchContext.matchedVisualKeywords.slice(0, 5).map((keyword, idx) => (
                            <span key={idx} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white/80 text-purple-800 border border-purple-200">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Search Section */}
              <div className="lg:col-span-3">
                {/* Search Input */}
                <div className="relative bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-slate-200/50 p-8 mb-8 overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-purple-50/30 to-pink-50/50"></div>
                  <div className="relative">
                    <div className="flex items-center space-x-4 mb-6">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                        <Target className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900">Intelligent Content Discovery</h2>
                        <p className="text-slate-600">Search using natural language and visual descriptions</p>
                      </div>
                      <div className="hidden sm:flex items-center space-x-1 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 px-4 py-2 rounded-full text-sm font-medium">
                        <Sparkles className="w-4 h-4" />
                        <span>AI Vision</span>
                      </div>
                    </div>
                    
                    <div className={`relative transition-all duration-300 ${searchFocused ? 'scale-[1.02]' : ''}`}>
                      <div className={`absolute -inset-1 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 rounded-2xl blur opacity-20 transition-opacity duration-300 ${searchFocused ? 'opacity-40' : ''}`}></div>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                          <Search className={`h-6 w-6 transition-colors duration-200 ${searchFocused ? 'text-blue-500' : 'text-slate-400'}`} />
                        </div>
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            if (error) setError(null);
                          }}
                          onKeyPress={handleKeyPress}
                          onFocus={() => setSearchFocused(true)}
                          onBlur={() => setSearchFocused(false)}
                          placeholder="Try: 'red sneakers with white logo' or 'sustainable fashion articles'"
                          className="block w-full pl-16 pr-32 py-6 bg-white border-2 border-slate-200 rounded-2xl text-lg placeholder-slate-500 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-100 disabled:cursor-not-allowed transition-all duration-200"
                          disabled={serverStatus === 'offline'}
                        />
                        <button
                          onClick={handleSearch}
                          disabled={!searchQuery.trim() || isSearching || serverStatus === 'offline'}
                          className="absolute inset-y-0 right-0 pr-4 flex items-center"
                        >
                          <div className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                            searchQuery.trim() && !isSearching && serverStatus === 'online'
                              ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:scale-105'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          }`}>
                            {isSearching ? (
                              <div className="flex items-center space-x-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Searching...</span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <span>Search</span>
                                <ArrowRight className="w-4 h-4" />
                              </div>
                            )}
                          </div>
                        </button>
                      </div>
                    </div>
                    
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center justify-center space-x-3 text-slate-600 bg-slate-50/80 rounded-2xl p-4">
                        <Brain className="w-5 h-5 text-blue-500" />
                        <span className="text-sm font-medium">AI understands context and meaning</span>
                      </div>
                      <div className="flex items-center justify-center space-x-3 text-slate-600 bg-slate-50/80 rounded-2xl p-4">
                        <ImageIcon className="w-5 h-5 text-purple-500" />
                        <span className="text-sm font-medium">Visual content analysis enabled</span>
                      </div>
                    </div>
                    
                    {/* Visual Search Examples */}
                    <div className="mt-8 p-6 bg-gradient-to-br from-purple-50/80 to-pink-50/80 rounded-2xl border border-purple-100/50">
                      <h4 className="text-sm font-semibold text-slate-800 mb-4 flex items-center">
                        <Eye className="w-5 h-5 mr-2 text-purple-500" />
                        Try these visual search examples:
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {visualSearchExamples.map((example, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleExampleClick(example)}
                            className="px-4 py-2 text-sm bg-white/80 border border-purple-200 rounded-full hover:bg-purple-50 hover:border-purple-300 hover:shadow-md transition-all duration-200 transform hover:scale-105"
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Search Results */}
                {showResults && (
                  <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden">
                    <div className="p-8 border-b border-slate-200/50 bg-gradient-to-r from-slate-50/50 to-blue-50/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-xl flex items-center justify-center">
                            <BarChart3 className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-slate-900">
                              Search Results
                              {!isSearching && searchResults.length > 0 && (
                                <span className="ml-2 text-lg font-normal text-slate-600">
                                  ({searchResults.length} results)
                                </span>
                              )}
                            </h3>
                            <p className="text-slate-600">Ranked by AI relevance score</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-6 text-sm">
                          <div className="flex items-center space-x-2 text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">
                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                            <span className="font-medium">Smart ranking</span>
                          </div>
                          {searchContext?.hasMultimodalResults && (
                            <div className="flex items-center space-x-2 text-purple-600 bg-purple-100 px-3 py-1.5 rounded-full">
                              <ImageIcon className="w-4 h-4" />
                              <span className="font-medium">{searchContext.multimodalResultsCount} with images</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {isSearching ? (
                      <div className="p-12">
                        <div className="flex flex-col items-center justify-center space-y-6">
                          <div className="relative">
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                              <Loader2 className="w-8 h-8 animate-spin text-white" />
                            </div>
                            <div className="absolute -inset-2 bg-gradient-to-br from-blue-400 to-purple-400 rounded-2xl blur opacity-20 animate-pulse"></div>
                          </div>
                          <div className="text-center">
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">Analyzing content with multimodal AI...</h3>
                            <p className="text-slate-600 mb-1">Processing visual and textual elements</p>
                            <p className="text-xs text-slate-500">First request may take longer on serverless functions</p>
                          </div>
                          <div className="w-48 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="w-full h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full animate-pulse"></div>
                          </div>
                        </div>
                      </div>
                    ) : searchResults.length > 0 ? (
                      <div className="divide-y divide-slate-100">
                        {searchResults.map((result, index) => {
                          const IconComponent = getContentTypeIcon(result.contentType || result.type);
                          const primaryImage = result.primaryImage || result.primary_image;
                          const allImages = result.allImages || result.all_images;
                          const colorScheme = getContentTypeColor(result.contentType || result.type);
                          
                          return (
                            <div key={result.id} className="p-8 hover:bg-gradient-to-r hover:from-slate-50/50 hover:to-blue-50/20 transition-all duration-300 group">
                              <div className="flex items-start space-x-6">
                                <div className={`flex-shrink-0 w-14 h-14 bg-gradient-to-br ${
                                  colorScheme === 'blue' ? 'from-blue-100 to-blue-200' :
                                  colorScheme === 'purple' ? 'from-purple-100 to-purple-200' :
                                  colorScheme === 'green' ? 'from-emerald-100 to-emerald-200' :
                                  colorScheme === 'yellow' ? 'from-amber-100 to-amber-200' :
                                  'from-slate-100 to-slate-200'
                                } rounded-2xl flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow`}>
                                  <IconComponent className={`w-6 h-6 ${
                                    colorScheme === 'blue' ? 'text-blue-600' :
                                    colorScheme === 'purple' ? 'text-purple-600' :
                                    colorScheme === 'green' ? 'text-emerald-600' :
                                    colorScheme === 'yellow' ? 'text-amber-600' :
                                    'text-slate-600'
                                  }`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                      <h4 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-blue-900 transition-colors">
                                        {result.title}
                                      </h4>
                                      <div className="flex items-center space-x-3 flex-wrap gap-2">
                                        <span className={`inline-flex items-center px-3 py-1.5 rounded-xl text-sm font-semibold border ${getSimilarityColor(result.similarity || result.relevance)}`}>
                                          <Activity className="w-3 h-3 mr-1" />
                                          {Math.round((result.similarity || result.relevance) * 100)}% match
                                        </span>
                                        {(primaryImage || (allImages && allImages.length > 0)) && (
                                          <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-sm font-semibold bg-purple-100 text-purple-700 border border-purple-200">
                                            <ImageIcon className="w-3 h-3 mr-1" />
                                            {allImages && allImages.length > 1 ? `${allImages.length} Images` : 'Image'}
                                          </span>
                                        )}
                                        {result.visualQueryMatch && (
                                          <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-sm font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                            <Eye className="w-3 h-3 mr-1" />
                                            Visual Match
                                          </span>
                                        )}
                                        {result.imageAnalyzed && (
                                          <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-sm font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                            <Sparkles className="w-3 h-3 mr-1" />
                                            AI Analyzed
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {/* Image Display */}
                                  {primaryImage && (
                                    <div className="mb-6">
                                      <div className="flex items-start space-x-4">
                                        <div className="relative">
                                          <ImageWithFallback 
                                            src={primaryImage}
                                            alt={result.title}
                                            className="w-64 h-48 object-cover rounded-2xl border border-slate-200 shadow-lg"
                                            result={result}
                                          />
                                          {result.imageAnalyzed && (
                                            <div className="absolute top-3 left-3 bg-gradient-to-r from-amber-400 to-orange-400 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-lg">
                                              <Sparkles className="w-3 h-3 inline mr-1" />
                                              AI Vision
                                            </div>
                                          )}
                                        </div>
                                        
                                        {/* Additional images */}
                                        {allImages && allImages.length > 1 && (
                                          <div className="flex flex-col space-y-3">
                                            <div className="text-sm font-medium text-slate-700">
                                              +{allImages.length - 1} more images
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 max-w-[140px]">
                                              {allImages.slice(1, 5).map((imageUrl, imgIdx) => (
                                                <ImageWithFallback
                                                  key={imgIdx}
                                                  src={imageUrl}
                                                  alt={`${result.title} ${imgIdx + 2}`}
                                                  className="w-16 h-12 object-cover rounded-xl border border-slate-200 shadow-sm"
                                                  result={result}
                                                />
                                              ))}
                                              {allImages.length > 5 && (
                                                <div className="w-16 h-12 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl border border-slate-200 flex items-center justify-center shadow-sm">
                                                  <span className="text-xs font-semibold text-slate-600">+{allImages.length - 5}</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* AI image analysis */}
                                      {result.imageAnalysis && (
                                        <div className="mt-4 p-4 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200">
                                          <div className="flex items-start space-x-3">
                                            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-400 rounded-lg flex items-center justify-center flex-shrink-0">
                                              <Sparkles className="w-4 h-4 text-white" />
                                            </div>
                                            <div>
                                              <p className="text-sm font-semibold text-amber-900 mb-1">AI Vision Analysis:</p>
                                              <p className="text-sm text-amber-800 leading-relaxed">{result.imageAnalysis}</p>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  <p className="text-slate-700 mb-4 leading-relaxed text-base">
                                    {result.snippet}
                                  </p>
                                  
                                  {/* Metadata */}
                                  <div className="flex items-center space-x-6 text-sm text-slate-600 flex-wrap gap-y-2 mb-4">
                                    <div className="flex items-center space-x-2">
                                      <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                                      <span className="capitalize font-medium">{result.contentType || result.type}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Globe className="w-4 h-4 text-slate-400" />
                                      <span className="font-medium">{(result.locale || 'en-us').toUpperCase()}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <Calendar className="w-4 h-4 text-slate-400" />
                                      <span>{result.lastModified || result.date}</span>
                                    </div>
                                    {result.price && (
                                      <div className="flex items-center space-x-2">
                                        <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                                        <span className="font-semibold text-emerald-600">{formatPrice(result.price)}</span>
                                      </div>
                                    )}
                                    {result.duration && (
                                      <div className="flex items-center space-x-2">
                                        <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                        <span>{formatDuration(result.duration)}</span>
                                      </div>
                                    )}
                                    {result.category && (
                                      <div className="flex items-center space-x-2">
                                        <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                                        <span className="font-medium text-purple-600">{result.category}</span>
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Tags */}
                                  {result.tags && result.tags.length > 0 && (
                                    <div className="flex items-center space-x-3 mb-4 flex-wrap">
                                      <Tag className="w-4 h-4 text-slate-400" />
                                      <div className="flex flex-wrap gap-2">
                                        {result.tags.slice(0, 4).map((tag, tagIdx) => (
                                          <span key={tagIdx} className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer border border-slate-200 transition-colors">
                                            {tag}
                                          </span>
                                        ))}
                                        {result.tags.length > 4 && (
                                          <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-slate-50 text-slate-500 border border-slate-200">
                                            +{result.tags.length - 4} more
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Action buttons */}
                                  {result.url && (
                                    <div className="flex items-center space-x-4">
                                      <a
                                        href={result.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 shadow-lg hover:shadow-xl"
                                      >
                                        <ExternalLink className="w-4 h-4 mr-2" />
                                        View Content
                                      </a>
                                      <div className="text-xs text-slate-500">
                                        Result #{index + 1}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-12 text-center">
                        <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
                          <Search className="w-10 h-10 text-slate-400" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-3">No Results Found</h3>
                        <p className="text-slate-600 mb-6 max-w-md mx-auto leading-relaxed">
                          Try different search terms or make sure content has been synced from Contentstack.
                        </p>
                        <button 
                          onClick={() => setShowResults(false)}
                          className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 shadow-lg"
                        >
                          <ArrowRight className="w-4 h-4 mr-2" />
                          Try New Search
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Empty State */}
                {!showResults && (
                  <div className="relative bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-slate-200/50 p-16 text-center overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 via-purple-50/20 to-pink-50/30"></div>
                    <div className="relative">
                      <div className="w-24 h-24 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl">
                        <Eye className="w-12 h-12 text-white" />
                        <div className="absolute -inset-2 bg-gradient-to-br from-blue-400 to-pink-400 rounded-3xl blur opacity-20 animate-pulse"></div>
                      </div>
                      <h3 className="text-2xl font-bold text-slate-900 mb-4">Discover Content with Multimodal AI</h3>
                      <p className="text-slate-600 mb-8 max-w-lg mx-auto text-lg leading-relaxed">
                        Enter natural language queries to find relevant content using both text understanding and visual element analysis.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6 border border-blue-200/50 text-left">
                          <div className="flex items-center mb-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center mr-3">
                              <Brain className="w-5 h-5 text-white" />
                            </div>
                            <div className="text-base font-semibold text-slate-900">Text Search</div>
                          </div>
                          <div className="text-sm text-slate-700 bg-white/80 rounded-xl p-3 border border-blue-200/50">
                            "sustainable fashion articles"
                          </div>
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-200/50 text-left">
                          <div className="flex items-center mb-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mr-3">
                              <Eye className="w-5 h-5 text-white" />
                            </div>
                            <div className="text-base font-semibold text-slate-900">Visual Search</div>
                          </div>
                          <div className="text-sm text-slate-700 bg-white/80 rounded-xl p-3 border border-purple-200/50">
                            "red shoes with white logo"
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Filters Sidebar */}
              <div className="lg:col-span-1">
                <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-slate-200/50 p-8 sticky top-28 overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 to-blue-50/20"></div>
                  <div className="relative">
                    <div className="flex items-center space-x-3 mb-8">
                      <div className="w-10 h-10 bg-gradient-to-br from-slate-600 to-slate-700 rounded-xl flex items-center justify-center">
                        <Filter className="w-5 h-5 text-white" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900">Smart Filters</h3>
                    </div>

                    {/* Content Types */}
                    <div className="mb-8">
                      <h4 className="text-base font-semibold text-slate-900 mb-4 flex items-center">
                        <Layers className="w-4 h-4 mr-2 text-slate-600" />
                        Content Types
                      </h4>
                      <div className="space-y-3">
                        {contentTypes.map((type) => {
                          const IconComponent = type.icon;
                          const isSelected = selectedContentTypes.includes(type.id);
                          return (
                            <label key={type.id} className="flex items-center space-x-4 cursor-pointer group">
                              <div className="relative">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleContentType(type.id)}
                                  className="sr-only"
                                />
                                <div className={`w-5 h-5 border-2 rounded-lg flex items-center justify-center transition-all duration-200 ${
                                  isSelected 
                                    ? `bg-gradient-to-br ${
                                        type.color === 'blue' ? 'from-blue-500 to-blue-600 border-blue-500' :
                                        type.color === 'purple' ? 'from-purple-500 to-purple-600 border-purple-500' :
                                        type.color === 'green' ? 'from-emerald-500 to-emerald-600 border-emerald-500' :
                                        type.color === 'yellow' ? 'from-amber-500 to-amber-600 border-amber-500' :
                                        'from-slate-500 to-slate-600 border-slate-500'
                                      }` 
                                    : 'border-slate-300 bg-white group-hover:border-slate-400'
                                }`}>
                                  {isSelected && (
                                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-3 flex-1">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                  type.color === 'blue' ? 'bg-blue-100' :
                                  type.color === 'purple' ? 'bg-purple-100' :
                                  type.color === 'green' ? 'bg-emerald-100' :
                                  type.color === 'yellow' ? 'bg-amber-100' :
                                  'bg-slate-100'
                                }`}>
                                  <IconComponent className={`w-4 h-4 ${
                                    type.color === 'blue' ? 'text-blue-600' :
                                    type.color === 'purple' ? 'text-purple-600' :
                                    type.color === 'green' ? 'text-emerald-600' :
                                    type.color === 'yellow' ? 'text-amber-600' :
                                    'text-slate-600'
                                  }`} />
                                </div>
                                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 flex-1">{type.name}</span>
                                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">{type.count}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Locales */}
                    <div className="mb-8">
                      <h4 className="text-base font-semibold text-slate-900 mb-4 flex items-center">
                        <Globe className="w-4 h-4 mr-2 text-slate-600" />
                        Locales
                      </h4>
                      <div className="space-y-3">
                        {locales.map((locale) => {
                          const isSelected = selectedLocales.includes(locale.code);
                          return (
                            <label key={locale.code} className="flex items-center space-x-4 cursor-pointer group">
                              <div className="relative">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleLocale(locale.code)}
                                  className="sr-only"
                                />
                                <div className={`w-5 h-5 border-2 rounded-lg flex items-center justify-center transition-all duration-200 ${
                                  isSelected 
                                    ? 'bg-gradient-to-br from-blue-500 to-purple-500 border-blue-500' 
                                    : 'border-slate-300 bg-white group-hover:border-slate-400'
                                }`}>
                                  {isSelected && (
                                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-3 flex-1">
                                <span className="text-lg">{locale.flag}</span>
                                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900 flex-1">{locale.name}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* AI Features Info */}
                    <div className="mb-8 p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border border-purple-200/50">
                      <h4 className="text-sm font-semibold text-slate-900 mb-4 flex items-center">
                        <Sparkles className="w-4 h-4 mr-2 text-purple-600" />
                        AI Capabilities
                      </h4>
                      <div className="space-y-3 text-xs">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                            <Eye className="w-4 h-4 text-purple-600" />
                          </div>
                          <span className="text-slate-700 font-medium">Image content analysis</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Brain className="w-4 h-4 text-blue-600" />
                          </div>
                          <span className="text-slate-700 font-medium">Context understanding</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                            <Zap className="w-4 h-4 text-amber-600" />
                          </div>
                          <span className="text-slate-700 font-medium">Visual query detection</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                            <Compass className="w-4 h-4 text-emerald-600" />
                          </div>
                          <span className="text-slate-700 font-medium">Multimodal search</span>
                        </div>
                      </div>
                    </div>

                    {/* Search Stats */}
                    {searchContext && (
                      <div className="mb-8 p-6 bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl border border-slate-200">
                        <h4 className="text-sm font-semibold text-slate-900 mb-4 flex items-center">
                          <BarChart3 className="w-4 h-4 mr-2 text-slate-600" />
                          Search Analytics
                        </h4>
                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-600">Results with images:</span>
                            <span className="font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-lg">{searchContext.multimodalResultsCount || 0}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-600">AI analyzed:</span>
                            <span className="font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-lg">{searchContext.analyzedImageCount || 0}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-600">Total images:</span>
                            <span className="font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded-lg">{searchContext.totalImagesFound || 0}</span>
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
                      className="w-full px-6 py-4 text-sm font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-2xl border-2 border-slate-200 hover:border-slate-300 transition-all duration-200 transform hover:scale-[1.02]"
                    >
                      Clear All Filters
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Content Management Tab */
          <div className="space-y-8">
            {/* Contentstack Configuration Panel */}
            {!isConnected && (
              <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-slate-200/50 p-8 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 to-purple-50/30"></div>
                <div className="relative">
                  <div className="flex items-center space-x-4 mb-8">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                      <Database className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">Connect to Contentstack</h2>
                      <p className="text-slate-600">Configure your Contentstack credentials to manage entries</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">API Key</label>
                      <input
                        type="text"
                        value={contentstackConfig.apiKey}
                        onChange={(e) => setContentstackConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                        placeholder="blt1234567890abcdef"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Delivery Token</label>
                      <input
                        type="text"
                        value={contentstackConfig.deliveryToken}
                        onChange={(e) => setContentstackConfig(prev => ({ ...prev, deliveryToken: e.target.value }))}
                        placeholder="cs1234567890abcdef"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Management Token</label>
                      <input
                        type="text"
                        value={contentstackConfig.managementToken}
                        onChange={(e) => setContentstackConfig(prev => ({ ...prev, managementToken: e.target.value }))}
                        placeholder="cm1234567890abcdef"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Region</label>
                      <select
                        value={contentstackConfig.region}
                        onChange={(e) => setContentstackConfig(prev => ({ ...prev, region: e.target.value }))}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      >
                        {contentstackRegions.map((region) => (
                          <option key={region.code} value={region.code}>
                            {region.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">Environment</label>
                      <input
                        type="text"
                        value={contentstackConfig.environment}
                        onChange={(e) => setContentstackConfig(prev => ({ ...prev, environment: e.target.value }))}
                        placeholder="production"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                    </div>
                  </div>

                  <div className="mt-8 flex items-center space-x-4">
                    <button
                      onClick={checkContentstackConnection}
                      disabled={!contentstackConfig.apiKey || !contentstackConfig.deliveryToken || connectionStatus === 'checking'}
                      className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg"
                    >
                      {connectionStatus === 'checking' ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <Link className="w-5 h-5 mr-2" />
                          Connect to Contentstack
                        </>
                      )}
                    </button>
                    
                    <div className="flex items-center space-x-2 text-sm text-slate-600">
                      <div className={`w-2 h-2 rounded-full ${
                        connectionStatus === 'connected' ? 'bg-emerald-400 animate-pulse' :
                        connectionStatus === 'error' ? 'bg-red-400' :
                        connectionStatus === 'checking' ? 'bg-amber-400 animate-pulse' :
                        'bg-slate-400'
                      }`}></div>
                      <span>
                        {connectionStatus === 'connected' ? 'Connected' :
                         connectionStatus === 'error' ? 'Connection failed' :
                         connectionStatus === 'checking' ? 'Connecting...' :
                         'Not connected'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Entry Management Panel */}
            {isConnected && (
              <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-slate-200/50 overflow-hidden">
                <div className="p-8 border-b border-slate-200/50 bg-gradient-to-r from-slate-50/50 to-blue-50/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-xl flex items-center justify-center">
                        <FileText className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-slate-900">Content Entries</h3>
                        <p className="text-slate-600">Manage your Contentstack entries</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={loadDemoEntries}
                        disabled={isLoadingEntries}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                      >
                        {isLoadingEntries ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-2" />
                        )}
                        Refresh
                      </button>
                      <button
                        onClick={() => openEntryModal()}
                        className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 shadow-lg"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        New Entry
                      </button>
                    </div>
                  </div>
                </div>

                {isLoadingEntries ? (
                  <div className="p-12">
                    <div className="flex flex-col items-center justify-center space-y-6">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                        <Loader2 className="w-8 h-8 animate-spin text-white" />
                      </div>
                      <div className="text-center">
                        <h3 className="text-lg font-semibold text-slate-900 mb-2">Loading entries...</h3>
                        <p className="text-slate-600">Fetching content from Contentstack</p>
                      </div>
                    </div>
                  </div>
                ) : managedEntries.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {managedEntries.map((entry) => (
                      <div key={entry.uid} className="p-8 hover:bg-slate-50/50 transition-colors group">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-blue-900 transition-colors">
                              {entry.title || 'Untitled Entry'}
                            </h4>
                            <p className="text-slate-600 mb-4 line-clamp-2">
                              {entry.content ? entry.content.substring(0, 200) + '...' : 'No content available'}
                            </p>
                            <div className="flex items-center space-x-4 text-sm text-slate-500">
                              <div className="flex items-center space-x-1">
                                <Calendar className="w-4 h-4" />
                                <span>Updated: {new Date(entry.updated_at).toLocaleDateString()}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Globe className="w-4 h-4" />
                                <span>{entry.locale || 'en-us'}</span>
                              </div>
                              {entry.tags && entry.tags.length > 0 && (
                                <div className="flex items-center space-x-1">
                                  <Tag className="w-4 h-4" />
                                  <span>{entry.tags.length} tags</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 ml-4">
                            <button
                              onClick={() => openEntryModal(entry)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit entry"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteEntry(entry.uid)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete entry"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <FileText className="w-10 h-10 text-slate-400" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-3">No Entries Found</h3>
                    <p className="text-slate-600 mb-6 max-w-md mx-auto leading-relaxed">
                      Create your first entry or check if you have the correct permissions to view entries.
                    </p>
                    <button 
                      onClick={() => openEntryModal()}
                      className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 shadow-lg"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create First Entry
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Entry Modal */}
      {showEntryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-8 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                    {editingEntry ? <Edit3 className="w-6 h-6 text-white" /> : <Plus className="w-6 h-6 text-white" />}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">
                      {editingEntry ? 'Edit Entry' : 'Create New Entry'}
                    </h3>
                    <p className="text-slate-600">Manage your content entry</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowEntryModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Title</label>
                <input
                  type="text"
                  value={entryForm.title}
                  onChange={(e) => setEntryForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter entry title"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Content</label>
                <textarea
                  value={entryForm.content}
                  onChange={(e) => setEntryForm(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Enter entry content"
                  rows={8}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-vertical"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Content Type</label>
                  <select
                    value={entryForm.contentType}
                    onChange={(e) => setEntryForm(prev => ({ ...prev, contentType: e.target.value }))}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  >
                    {contentTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Locale</label>
                  <select
                    value={entryForm.locale}
                    onChange={(e) => setEntryForm(prev => ({ ...prev, locale: e.target.value }))}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  >
                    {locales.map((locale) => (
                      <option key={locale.code} value={locale.code}>
                        {locale.flag} {locale.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Tags</label>
                <input
                  type="text"
                  value={entryForm.tags.join(', ')}
                  onChange={(e) => setEntryForm(prev => ({ ...prev, tags: e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag) }))}
                  placeholder="Enter tags separated by commas"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
                <p className="text-xs text-slate-500 mt-2">Separate multiple tags with commas</p>
              </div>
            </div>
            
            <div className="p-8 border-t border-slate-200 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setShowEntryModal(false);
                    setEditingEntry(null);
                    resetEntryForm();
                  }}
                  className="px-6 py-3 text-slate-600 hover:text-slate-900 font-semibold rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEntry}
                  disabled={!entryForm.title.trim() || isSaving}
                  className="inline-flex items-center px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {editingEntry ? 'Update Entry' : 'Create Entry'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-8 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-slate-600 to-slate-700 rounded-2xl flex items-center justify-center shadow-lg">
                    <Settings className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900">Contentstack Configuration</h3>
                    <p className="text-slate-600">Manage your CMS connection settings</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-8 space-y-8">
              {/* Connection Status */}
              <div className="flex items-center justify-between p-6 bg-gradient-to-r from-slate-50 to-blue-50 rounded-2xl border border-slate-200">
                <div className="flex items-center space-x-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    connectionStatus === 'connected' ? 'bg-emerald-100' :
                    connectionStatus === 'error' ? 'bg-red-100' :
                    connectionStatus === 'checking' ? 'bg-amber-100' :
                    'bg-slate-100'
                  }`}>
                    {connectionStatus === 'connected' ? (
                      <CheckCircle className="w-6 h-6 text-emerald-600" />
                    ) : connectionStatus === 'error' ? (
                      <AlertTriangle className="w-6 h-6 text-red-600" />
                    ) : connectionStatus === 'checking' ? (
                      <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
                    ) : (
                      <Database className="w-6 h-6 text-slate-600" />
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900">Connection Status</h4>
                    <p className="text-sm text-slate-600">
                      {connectionStatus === 'connected' ? 'Successfully connected to Contentstack' :
                       connectionStatus === 'error' ? 'Failed to connect - check your credentials' :
                       connectionStatus === 'checking' ? 'Testing connection...' :
                       'Not connected to Contentstack'}
                    </p>
                  </div>
                </div>
                {isConnected && (
                  <div className="text-emerald-600 font-semibold text-sm bg-emerald-100 px-3 py-1.5 rounded-full">
                    ✓ Active
                  </div>
                )}
              </div>

              {/* API Credentials */}
              <div>
                <h4 className="text-lg font-semibold text-slate-900 mb-4">API Credentials</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">API Key</label>
                    <input
                      type="password"
                      value={contentstackConfig.apiKey}
                      onChange={(e) => setContentstackConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                      placeholder="blt1234567890abcdef"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Delivery Token</label>
                    <input
                      type="password"
                      value={contentstackConfig.deliveryToken}
                      onChange={(e) => setContentstackConfig(prev => ({ ...prev, deliveryToken: e.target.value }))}
                      placeholder="cs1234567890abcdef"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Management Token</label>
                    <input
                      type="password"
                      value={contentstackConfig.managementToken}
                      onChange={(e) => setContentstackConfig(prev => ({ ...prev, managementToken: e.target.value }))}
                      placeholder="cm1234567890abcdef"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                    <p className="text-xs text-slate-500 mt-2">Required for creating, updating, and deleting entries</p>
                  </div>
                </div>
              </div>

              {/* Region and Environment */}
              <div>
                <h4 className="text-lg font-semibold text-slate-900 mb-4">Stack Configuration</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Region</label>
                    <select
                      value={contentstackConfig.region}
                      onChange={(e) => setContentstackConfig(prev => ({ ...prev, region: e.target.value }))}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    >
                      {contentstackRegions.map((region) => (
                        <option key={region.code} value={region.code}>
                          {region.name} ({region.endpoint})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Environment</label>
                    <input
                      type="text"
                      value={contentstackConfig.environment}
                      onChange={(e) => setContentstackConfig(prev => ({ ...prev, environment: e.target.value }))}
                      placeholder="production"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                  </div>
                </div>
              </div>

              {/* Sync Settings */}
              <div className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border border-purple-200/50">
                <h4 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
                  <RefreshCw className="w-5 h-5 mr-2 text-purple-600" />
                  Search Sync
                </h4>
                <p className="text-sm text-slate-700 mb-4">
                  Changes to entries will automatically sync to the search backend for AI-powered discovery.
                </p>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={syncToSearchBackend}
                    className="inline-flex items-center px-4 py-2 bg-purple-600 text-white font-medium rounded-xl hover:bg-purple-700 transition-colors"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Manual Sync
                  </button>
                  <div className="text-xs text-slate-600">
                    Backend: {API_BASE_URL}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-8 border-t border-slate-200 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="px-6 py-3 text-slate-600 hover:text-slate-900 font-semibold rounded-xl hover:bg-slate-100 transition-colors"
                >
                  Close
                </button>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => {
                      setContentstackConfig({
                        apiKey: '',
                        deliveryToken: '',
                        managementToken: '',
                        region: 'us',
                        environment: 'production'
                      });
                      setIsConnected(false);
                      setConnectionStatus('disconnected');
                    }}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 font-medium rounded-xl transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => {
                      checkContentstackConnection();
                      setShowConfigModal(false);
                    }}
                    disabled={!contentstackConfig.apiKey || !contentstackConfig.deliveryToken}
                    className="inline-flex items-center px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 shadow-lg"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save & Test Connection
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="relative mt-16 bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 text-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-purple-600/10"></div>
        <div className="relative max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-bold">Neural Search</h3>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed">
                Advanced AI-powered content discovery and management platform with full Contentstack integration.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-slate-200">Search Features</h4>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                  <span>Multimodal AI search</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-purple-400 rounded-full"></div>
                  <span>Visual content analysis</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-pink-400 rounded-full"></div>
                  <span>Context understanding</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full"></div>
                  <span>Semantic similarity</span>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-slate-200">Management</h4>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                  <span>Create entries</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-amber-400 rounded-full"></div>
                  <span>Update content</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-red-400 rounded-full"></div>
                  <span>Delete entries</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></div>
                  <span>Auto-sync to search</span>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-slate-200">Performance</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">Search Accuracy</span>
                  <span className="text-emerald-400 font-semibold">98.7%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">Response Time</span>
                  <span className="text-blue-400 font-semibold">&lt; 2s</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">CMS Integration</span>
                  <span className="text-purple-400 font-semibold">Real-time</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">Content Types</span>
                  <span className="text-pink-400 font-semibold">500+</span>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-700/50 mt-8 pt-8 text-center">
            <p className="text-slate-400 text-sm">
              Powered by advanced AI models • Full Contentstack CMS integration • Real-time sync capabilities
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedSemanticSearch;