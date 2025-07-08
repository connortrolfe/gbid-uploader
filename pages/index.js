import { useState } from 'react';
import Head from 'next/head';
import Papa from 'papaparse';

export default function Home() {
  const [formData, setFormData] = useState({
    name: '',
    gbid: '',
    gbidTemplate: '',
    alternateNames: '',
    specialNotes: ''
  });
  const [properties, setProperties] = useState(['']);
  const [isUploading, setIsUploading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [uploadMode, setUploadMode] = useState('single'); // 'single', 'batch', 'bulk-size', or 'manage'
  const [bulkData, setBulkData] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const addProperty = () => {
    setProperties([...properties, '']);
  };

  const updateProperty = (index, value) => {
    const newProperties = [...properties];
    newProperties[index] = value;
    setProperties(newProperties);
  };

  const removeProperty = (index) => {
    if (properties.length > 1) {
      const newProperties = properties.filter((_, i) => i !== index);
      setProperties(newProperties);
    }
  };

  const addLog = (message) => {
    setLogs(prev => [...prev, { message, timestamp: new Date().toLocaleTimeString() }]);
  };

  const handleSingleUpload = async () => {
    if (!formData.name || (!formData.gbid && !formData.gbidTemplate)) {
      addLog('Error: Name and at least one of GBID or GBID Template are required');
      return;
    }

    setIsUploading(true);
    addLog(`Uploading: ${formData.name} (${formData.gbid})...`);

    try {
      const propertiesString = properties.filter(p => p.trim()).join('; ');
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'single',
          data: {
            name: formData.name,
            gbid: formData.gbid,
            gbidTemplate: formData.gbidTemplate,
            properties: propertiesString,
            alternateNames: formData.alternateNames,
            specialNotes: formData.specialNotes
          }
        }),
      });

      const result = await response.json();
      
      if (response.ok) {
        addLog(`Success: ${formData.name} (${formData.gbid}) uploaded`);
        // Clear form
        setFormData({ name: '', gbid: '', gbidTemplate: '', alternateNames: '', specialNotes: '' });
        setProperties(['']);
      } else {
        addLog(`Error: ${result.error}`);
      }
    } catch (error) {
      addLog(`Error: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleBatchUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    addLog('Processing CSV file...');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const { data, errors } = results;
        
        if (errors.length > 0) {
          addLog(`CSV parsing errors: ${errors.map(e => e.message).join(', ')}`);
          setIsUploading(false);
          return;
        }

        if (data.length === 0) {
          addLog('No data found in CSV file');
          setIsUploading(false);
          return;
        }

        // Validate required columns
        const requiredCols = ['Name'];
        const firstRow = data[0];
        const missingCols = requiredCols.filter(col => !(col in firstRow));
        
        if (missingCols.length > 0) {
          addLog(`Error: Missing required columns: ${missingCols.join(', ')}`);
          setIsUploading(false);
          return;
        }

        addLog(`Found ${data.length} items to upload`);

        // Upload each item
        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const name = row.Name?.trim();
          const gbid = row.GBID?.trim();
          const gbidTemplate = row['GBID Template']?.trim();

          if (!name || (!gbid && !gbidTemplate)) {
            addLog(`Skipping row ${i + 1}: missing Name and both GBID and GBID Template`);
            continue;
          }

          addLog(`Uploading ${i + 1}/${data.length}: ${name} (${gbid})...`);

          try {
            const response = await fetch('/api/upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'single',
                data: {
                  name,
                  gbid,
                  gbidTemplate: gbidTemplate || '',
                  properties: row.Properties?.trim() || '',
                  alternateNames: row['Alternate Names']?.trim() || '',
                  specialNotes: row['Special Notes']?.trim() || ''
                }
              }),
            });

            const result = await response.json();
            
            if (response.ok) {
              addLog(`Success: ${name} (${gbid}) uploaded`);
            } else {
              addLog(`Error uploading ${name}: ${result.error}`);
            }
          } catch (error) {
            addLog(`Error uploading ${name}: ${error.message}`);
          }
        }

        addLog('Batch upload complete');
        setIsUploading(false);
      },
      error: (error) => {
        addLog(`CSV parsing error: ${error.message}`);
        setIsUploading(false);
      }
    });
  };

  const parseBulkData = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    const items = [];
    let currentItem = null;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Check if this is a new item (starts with a letter and has ":" at the end)
      if (/^[A-Z].*:$/.test(trimmedLine)) {
        if (currentItem) {
          items.push(currentItem);
        }
        currentItem = {
          name: trimmedLine.slice(0, -1).trim(), // Remove the ":"
          configurations: []
        };
      } else if (currentItem && trimmedLine.includes(':')) {
        // This is a configuration line (size: gbid)
        const [size, gbid] = trimmedLine.split(':').map(s => s.trim());
        if (size && gbid) {
          currentItem.configurations.push({ size, gbid });
        }
      }
    }

    // Add the last item
    if (currentItem) {
      items.push(currentItem);
    }

    return items;
  };

  const handleBulkSizeUpload = async () => {
    if (!bulkData.trim()) {
      addLog('Error: Please enter bulk data');
      return;
    }

    setIsUploading(true);
    addLog('Parsing bulk data...');

    try {
      const items = parseBulkData(bulkData);
      addLog(`Found ${items.length} items with multiple configurations`);

      let totalUploads = 0;
      let successCount = 0;

      for (const item of items) {
        addLog(`Processing: ${item.name} (${item.configurations.length} configurations)`);
        
        for (const config of item.configurations) {
          totalUploads++;
          addLog(`Uploading ${totalUploads}: ${item.name} - ${config.size} (${config.gbid})...`);

          try {
            const response = await fetch('/api/upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'single',
                data: {
                  name: item.name,
                  gbid: config.gbid,
                  properties: config.size,
                  alternateNames: '',
                  specialNotes: ''
                }
              }),
            });

                  const result = await response.json();
      
                  if (response.ok) {
              addLog(`Success: ${item.name} - ${config.size} (${config.gbid}) uploaded`);
              successCount++;
              // Add a small delay between uploads to prevent rate limiting
              await new Promise(resolve => setTimeout(resolve, 500));
            } else {
              addLog(`Error uploading ${item.name} - ${config.size}: ${result.error}`);
              if (result.details) {
                addLog(`Details: ${result.details}`);
              }
            }
          } catch (error) {
            addLog(`Error uploading ${item.name} - ${config.size}: ${error.message}`);
          }
        }
      }

      addLog(`Bulk upload complete: ${successCount}/${totalUploads} items uploaded successfully`);
    } catch (error) {
      addLog(`Error processing bulk data: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      addLog('Error: Please enter a search term');
      return;
    }

    setIsSearching(true);
    addLog(`Searching for: ${searchQuery}`);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery
        }),
      });

      const result = await response.json();
      
      if (response.ok) {
        setSearchResults(result.results || []);
        addLog(`Found ${result.results?.length || 0} items`);
      } else {
        addLog(`Search error: ${result.error}`);
        setSearchResults([]);
      }
    } catch (error) {
      addLog(`Search error: ${error.message}`);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleEditItem = async (item, updatedData) => {
    addLog(`Updating: ${item.name} (${item.gbid})...`);

    try {
      const response = await fetch('/api/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          originalGbid: item.gbid,
          data: updatedData
        }),
      });

      const result = await response.json();
      
      if (response.ok) {
        addLog(`Success: ${updatedData.name} (${updatedData.gbid}) updated`);
        setEditingItem(null);
        // Refresh search results
        if (searchQuery.trim()) {
          handleSearch();
        }
      } else {
        addLog(`Error updating ${item.name}: ${result.error}`);
      }
    } catch (error) {
      addLog(`Error updating ${item.name}: ${error.message}`);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!confirm(`Are you sure you want to delete ${item.name} (${item.gbid})?`)) {
      return;
    }

    addLog(`Deleting: ${item.name} (${item.gbid})...`);

    try {
      const response = await fetch('/api/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gbid: item.gbid
        }),
      });

      const result = await response.json();
      
      if (response.ok) {
        addLog(`Success: ${item.name} (${item.gbid}) deleted`);
        // Remove from search results
        setSearchResults(prev => prev.filter(i => i.gbid !== item.gbid));
      } else {
        addLog(`Error deleting ${item.name}: ${result.error}`);
      }
    } catch (error) {
      addLog(`Error deleting ${item.name}: ${error.message}`);
    }
  };

  const handleExportCSV = () => {
    if (searchResults.length === 0) {
      addLog('No items to export');
      return;
    }

    const csvContent = [
      ['Name', 'GBID', 'GBID Template', 'Properties', 'Alternate Names', 'Special Notes'],
      ...searchResults.map(item => [
        item.name,
        item.gbid,
        item.gbidTemplate,
        item.properties,
        item.alternate_names,
        item.special_notes
      ])
    ].map(row => row.map(field => `"${field || ''}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gbid-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    addLog(`Exported ${searchResults.length} items to CSV`);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <Head>
        <title>GBID Pinecone Uploader</title>
        <meta name="description" content="Upload GBID materials to Pinecone database" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">GBID Pinecone Uploader</h1>
          
          {/* Upload Mode Toggle */}
          <div className="mb-6">
            <div className="flex space-x-4">
              <button
                onClick={() => setUploadMode('single')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  uploadMode === 'single'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Single Upload
              </button>
              <button
                onClick={() => setUploadMode('batch')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  uploadMode === 'batch'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Batch Upload (CSV)
              </button>
              <button
                onClick={() => setUploadMode('bulk-size')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  uploadMode === 'bulk-size'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Bulk Size Upload
              </button>
              <button
                onClick={() => setUploadMode('manage')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  uploadMode === 'manage'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Manage Database
              </button>
            </div>
          </div>

          {uploadMode === 'single' && (
            /* Single Upload Form */
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., RIGID COUPLINGS"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    GBID *
                  </label>
                  <input
                    type="text"
                    value={formData.gbid}
                    onChange={(e) => setFormData({...formData, gbid: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 88254013"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GBID Template
                </label>
                <input
                  type="text"
                  value={formData.gbidTemplate}
                  onChange={(e) => setFormData({...formData, gbidTemplate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., =ASE(SIZE)X(SIZE)X(SIZE)*"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Alternate Names
                </label>
                <input
                  type="text"
                  value={formData.alternateNames}
                  onChange={(e) => setFormData({...formData, alternateNames: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., GALV COUPLINGS, GALVANIZED COUPLINGS"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Special Notes
                </label>
                <input
                  type="text"
                  value={formData.specialNotes}
                  onChange={(e) => setFormData({...formData, specialNotes: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Standard"
                />
              </div>

              {/* Properties */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Properties
                  </label>
                  <button
                    type="button"
                    onClick={addProperty}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    + Add Property
                  </button>
                </div>
                <div className="space-y-2">
                  {properties.map((property, index) => (
                    <div key={index} className="flex space-x-2">
                      <input
                        type="text"
                        value={property}
                        onChange={(e) => updateProperty(index, e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={`Property ${index + 1} (e.g., 1/2 inch)`}
                      />
                      {properties.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeProperty(index)}
                          className="px-3 py-2 text-red-600 hover:text-red-800 font-medium"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSingleUpload}
                disabled={isUploading}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isUploading ? 'Uploading...' : 'Upload Item'}
              </button>
            </div>
          )}

          {uploadMode === 'batch' && (
            /* Batch Upload */
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleBatchUpload}
                  disabled={isUploading}
                  className="hidden"
                  id="csv-upload"
                />
                <label
                  htmlFor="csv-upload"
                  className="cursor-pointer block"
                >
                  <div className="text-gray-600">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="mt-2 text-lg font-medium">
                      {isUploading ? 'Processing...' : 'Click to upload CSV file'}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      CSV should have columns: Name, GBID, GBID Template, Properties, Alternate Names, Special Notes
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {uploadMode === 'bulk-size' && (
            /* Bulk Size Upload */
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paste your bulk data here:
                </label>
                <textarea
                  value={bulkData}
                  onChange={(e) => setBulkData(e.target.value)}
                  className="w-full h-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder={`Example format:

RIGID COUPLINGS:
1/2": 88272937
3/4": 88272942
1": 88272936
1 1/4": 88272935
1 1/2": 88272934
2": 88272939

RIGID CONDUIT:
1/2": 12345678
3/4": 12345679
1": 12345680`}
                  disabled={isUploading}
                />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-blue-900 mb-2">Format Instructions:</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Item name should end with ":" (e.g., "RIGID COUPLINGS:")</li>
                  <li>• Each size/GBID pair on a new line (e.g., "1/2": 88272937")</li>
                  <li>• Leave a blank line between different items</li>
                  <li>• The app will create separate uploads for each size configuration</li>
                </ul>
              </div>
              <button
                onClick={handleBulkSizeUpload}
                disabled={isUploading || !bulkData.trim()}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isUploading ? 'Processing...' : 'Upload All Configurations'}
              </button>
            </div>
          )}

          {uploadMode === 'manage' && (
            /* Manage Database */
            <div className="space-y-4">
              {/* Search Section */}
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, GBID, or properties..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
                {searchResults.length > 0 && (
                  <button
                    onClick={handleExportCSV}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Export CSV
                  </button>
                )}
              </div>

              {/* Results Table */}
              {searchResults.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GBID</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GBID Template</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Properties</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alternate Names</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Special Notes</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 z-10">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {searchResults.map((item, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {editingItem?.gbid === item.gbid ? (
                                <input
                                  type="text"
                                  defaultValue={item.name}
                                  className="w-full px-2 py-1 border border-gray-300 rounded"
                                  onBlur={(e) => {
                                    const updatedData = { ...editingItem, name: e.target.value };
                                    setEditingItem(updatedData);
                                  }}
                                />
                              ) : (
                                item.name
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {editingItem?.gbid === item.gbid ? (
                                <input
                                  type="text"
                                  defaultValue={item.gbid}
                                  className="w-full px-2 py-1 border border-gray-300 rounded"
                                  onBlur={(e) => {
                                    const updatedData = { ...editingItem, gbid: e.target.value };
                                    setEditingItem(updatedData);
                                  }}
                                />
                              ) : (
                                item.gbid
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {editingItem?.gbid === item.gbid ? (
                                <input
                                  type="text"
                                  defaultValue={item.gbidTemplate}
                                  className="w-full px-2 py-1 border border-gray-300 rounded"
                                  onBlur={(e) => {
                                    const updatedData = { ...editingItem, gbidTemplate: e.target.value };
                                    setEditingItem(updatedData);
                                  }}
                                />
                              ) : (
                                item.gbidTemplate
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {editingItem?.gbid === item.gbid ? (
                                <input
                                  type="text"
                                  defaultValue={item.properties}
                                  className="w-full px-2 py-1 border border-gray-300 rounded"
                                  onBlur={(e) => {
                                    const updatedData = { ...editingItem, properties: e.target.value };
                                    setEditingItem(updatedData);
                                  }}
                                />
                              ) : (
                                item.properties
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {editingItem?.gbid === item.gbid ? (
                                <input
                                  type="text"
                                  defaultValue={item.alternate_names}
                                  className="w-full px-2 py-1 border border-gray-300 rounded"
                                  onBlur={(e) => {
                                    const updatedData = { ...editingItem, alternate_names: e.target.value };
                                    setEditingItem(updatedData);
                                  }}
                                />
                              ) : (
                                item.alternate_names
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {editingItem?.gbid === item.gbid ? (
                                <input
                                  type="text"
                                  defaultValue={item.special_notes}
                                  className="w-full px-2 py-1 border border-gray-300 rounded"
                                  onBlur={(e) => {
                                    const updatedData = { ...editingItem, special_notes: e.target.value };
                                    setEditingItem(updatedData);
                                  }}
                                />
                              ) : (
                                item.special_notes
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium sticky right-0 bg-white z-10">
                              {editingItem?.gbid === item.gbid ? (
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => handleEditItem(item, editingItem)}
                                    className="text-green-600 hover:text-green-900"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingItem(null)}
                                    className="text-gray-600 hover:text-gray-900"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => setEditingItem(item)}
                                    className="text-blue-600 hover:text-blue-900"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item)}
                                    className="text-red-600 hover:text-red-900"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {searchResults.length === 0 && searchQuery && !isSearching && (
                <div className="text-center py-8 text-gray-500">
                  No items found matching "{searchQuery}"
                </div>
              )}
            </div>
          )}
        </div>

        {/* Logs */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload Log</h2>
          <div className="bg-gray-100 rounded-lg p-4 h-64 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-500">No uploads yet. Start uploading items to see logs here.</p>
            ) : (
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div key={index} className="text-sm">
                    <span className="text-gray-500">[{log.timestamp}]</span>
                    <span className={`ml-2 ${
                      log.message.includes('Error') ? 'text-red-600' :
                      log.message.includes('Success') ? 'text-green-600' :
                      'text-gray-700'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 
