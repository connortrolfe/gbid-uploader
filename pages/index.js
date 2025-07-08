import { useState, useRef, useCallback, useEffect } from 'react';
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
  const [editingRowId, setEditingRowId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const defaultColumnWidths = [220, 140, 200, 200, 220, 300, 120]; // wider columns
  const [columnWidths, setColumnWidths] = useState(defaultColumnWidths);
  const [resizing, setResizing] = useState({ colIdx: null, startX: 0, startWidth: 0 });
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    if (resizing.colIdx !== null) {
      const handleMouseMove = (e) => {
        const delta = e.clientX - resizing.startX;
        setColumnWidths((widths) => {
          const newWidths = [...widths];
          newWidths[resizing.colIdx] = Math.max(60, resizing.startWidth + delta);
          return newWidths;
        });
      };
      const handleMouseUp = () => {
        setResizing({ colIdx: null, startX: 0, startWidth: 0 });
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [resizing]);

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
    console.log('formData:', formData); // Debug log
    if (!formData.name || (!formData.gbid.trim() && !formData.gbidTemplate.trim())) {
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
        const dedupeResults = (results) => {
          const seen = new Set();
          return results.filter(item => {
            const id = item.gbid || item.gbidTemplate || item.name;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
        };
        setSearchResults(dedupeResults(result.results || []));
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

  const getRowId = (item) => item.gbid || item.gbidTemplate || item.name;

  const handleEditItem = async (item, updatedData) => {
    const backendData = {
      ...updatedData,
      alternateNames: updatedData.alternate_names,
      specialNotes: updatedData.special_notes,
    };
    const originalGbid = updatedData.originalGbid || updatedData.originalId;
    console.log('Updating item with data:', backendData);
    addLog(`Updating: ${backendData.name} (${backendData.gbid})...`);
    try {
      const response = await fetch('/api/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          originalGbid,
          data: backendData
        }),
      });
      const result = await response.json();
      if (response.ok) {
        addLog(`Success: ${backendData.name} (${backendData.gbid}) updated`);
        setEditingRowId(null);
        setEditFormData({});
        // Refresh search results
        if (searchQuery.trim()) {
          handleSearch();
        }
      } else {
        addLog(`Error updating ${backendData.name}: ${result.error}`);
        alert(`Error updating: ${result.error}`);
      }
    } catch (error) {
      addLog(`Error updating ${backendData.name}: ${error.message}`);
      alert(`Error updating: ${error.message}`);
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
          vectorId: item.vectorId,
        }),
      });

      const result = await response.json();
      
      if (response.ok) {
        addLog(`Success: ${item.name} (${item.gbid}) deleted`);
        // Remove from search results by vectorId
        setSearchResults(prev => prev.filter(i => i.vectorId !== item.vectorId));
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

  const handleMouseDown = (e, colIdx) => {
    setResizing({ colIdx, startX: e.clientX, startWidth: columnWidths[colIdx] });
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <Head>
        <title>GBID Pinecone Uploader</title>
        <meta name="description" content="Upload GBID materials to Pinecone database" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="max-w-7xl w-full mx-auto px-8">
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
                  <textarea
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    placeholder="e.g., RIGID COUPLINGS"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    GBID *
                  </label>
                  <textarea
                    value={formData.gbid}
                    onChange={(e) => setFormData({...formData, gbid: e.target.value})}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                    placeholder="e.g., 88254013"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GBID Template
                </label>
                <textarea
                  value={formData.gbidTemplate}
                  onChange={(e) => setFormData({...formData, gbidTemplate: e.target.value})}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  placeholder="e.g., =ASE(SIZE)X(SIZE)X(SIZE)*"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Alternate Names
                </label>
                <textarea
                  value={formData.alternateNames}
                  onChange={(e) => setFormData({...formData, alternateNames: e.target.value})}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  placeholder="e.g., GALV COUPLINGS, GALVANIZED COUPLINGS"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Special Notes
                </label>
                <textarea
                  value={formData.specialNotes}
                  onChange={(e) => setFormData({...formData, specialNotes: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
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
                <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                  <div>
                    <table
                      className="min-w-[1200px] min-w-full divide-y divide-gray-200"
                      style={{ tableLayout: 'fixed', width: '100%' }}
                    >
                      <thead className="bg-gray-50">
                        <tr>
                          <th
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            style={{ width: 120, minWidth: 100, maxWidth: 160, position: 'sticky', left: 0, background: 'white', zIndex: 30, boxShadow: '2px 0 4px -2px #ccc' }}
                          >
                            Actions
                          </th>
                          <th
                            className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            style={{ width: columnWidths[0], minWidth: 60, maxWidth: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            Name
                            <div
                              style={{
                                position: 'absolute', right: 0, top: 0, height: '100%', width: '12px', cursor: 'col-resize', zIndex: 50, userSelect: 'none', pointerEvents: 'all', transition: 'background 0.2s',
                                background: 'transparent',
                              }}
                              onMouseDown={e => handleMouseDown(e, 0)}
                              onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            />
                          </th>
                          <th
                            className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            style={{ width: columnWidths[1], minWidth: 60, maxWidth: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            GBID
                            <div
                              style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '12px', cursor: 'col-resize', zIndex: 50, userSelect: 'none', pointerEvents: 'all', transition: 'background 0.2s',
                                background: 'transparent',
                              }}
                              onMouseDown={e => handleMouseDown(e, 1)}
                              onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            />
                          </th>
                          <th
                            className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            style={{ width: columnWidths[2], minWidth: 60, maxWidth: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            GBID Template
                            <div
                              style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '12px', cursor: 'col-resize', zIndex: 50, userSelect: 'none', pointerEvents: 'all', transition: 'background 0.2s',
                                background: 'transparent',
                              }}
                              onMouseDown={e => handleMouseDown(e, 2)}
                              onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            />
                          </th>
                          <th
                            className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            style={{ width: columnWidths[3], minWidth: 60, maxWidth: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            Properties
                            <div
                              style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '12px', cursor: 'col-resize', zIndex: 50, userSelect: 'none', pointerEvents: 'all', transition: 'background 0.2s',
                                background: 'transparent',
                              }}
                              onMouseDown={e => handleMouseDown(e, 3)}
                              onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            />
                          </th>
                          <th
                            className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            style={{ width: columnWidths[4], minWidth: 60, maxWidth: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            Alternate Names
                            <div
                              style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '12px', cursor: 'col-resize', zIndex: 50, userSelect: 'none', pointerEvents: 'all', transition: 'background 0.2s',
                                background: 'transparent',
                              }}
                              onMouseDown={e => handleMouseDown(e, 4)}
                              onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            />
                          </th>
                          <th
                            className="relative px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            style={{ width: columnWidths[5], minWidth: 60, maxWidth: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            Special Notes
                            <div
                              style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '12px', cursor: 'col-resize', zIndex: 50, userSelect: 'none', pointerEvents: 'all', transition: 'background 0.2s',
                                background: 'transparent',
                              }}
                              onMouseDown={e => handleMouseDown(e, 5)}
                              onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            />
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {searchResults.map((item, index) => (
                          <tr key={getRowId(item)} className="hover:bg-gray-50">
                            <td
                              className="px-6 py-4 whitespace-nowrap text-sm font-medium"
                              style={{ width: 120, minWidth: 100, maxWidth: 160, position: 'sticky', left: 0, background: 'white', zIndex: 30, boxShadow: '2px 0 4px -2px #ccc' }}
                            >
                              {editingRowId === getRowId(item) ? (
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => handleEditItem(item, editFormData)}
                                    className="text-green-600 hover:text-green-900"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => { setEditingRowId(null); setEditFormData({}); }}
                                    className="text-gray-600 hover:text-gray-900"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => {
                                      setEditingRowId(getRowId(item));
                                      setEditFormData({
                                        name: item.name || '',
                                        gbid: item.gbid || '',
                                        gbidTemplate: item.gbidTemplate || '',
                                        properties: item.properties || '',
                                        alternate_names: item.alternate_names || '',
                                        special_notes: item.special_notes || '',
                                        originalGbid: item.gbid || '',
                                        originalId: getRowId(item),
                                      });
                                    }}
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
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900" style={{ width: columnWidths[0], minWidth: 60, maxWidth: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {editingRowId === getRowId(item) ? (
                                <textarea
                                  value={editFormData.name}
                                  className="w-full px-2 py-1 border border-gray-300 rounded resize-y"
                                  rows={2}
                                  onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                                />
                              ) : (
                                item.name
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" style={{ width: columnWidths[1], minWidth: 60, maxWidth: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {editingRowId === getRowId(item) ? (
                                <textarea
                                  value={editFormData.gbid}
                                  className="w-full px-2 py-1 border border-gray-300 rounded resize-y"
                                  rows={2}
                                  onChange={e => setEditFormData({ ...editFormData, gbid: e.target.value })}
                                />
                              ) : (
                                item.gbid
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" style={{ width: columnWidths[2], minWidth: 60, maxWidth: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {editingRowId === getRowId(item) ? (
                                <textarea
                                  value={editFormData.gbidTemplate}
                                  className="w-full px-2 py-1 border border-gray-300 rounded resize-y"
                                  rows={2}
                                  onChange={e => setEditFormData({ ...editFormData, gbidTemplate: e.target.value })}
                                />
                              ) : (
                                item.gbidTemplate
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" style={{ width: columnWidths[3], minWidth: 60, maxWidth: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {editingRowId === getRowId(item) ? (
                                <textarea
                                  value={editFormData.properties}
                                  className="w-full px-2 py-1 border border-gray-300 rounded resize-y"
                                  rows={2}
                                  onChange={e => setEditFormData({ ...editFormData, properties: e.target.value })}
                                />
                              ) : (
                                item.properties
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" style={{ width: columnWidths[4], minWidth: 60, maxWidth: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {editingRowId === getRowId(item) ? (
                                <textarea
                                  value={editFormData.alternate_names}
                                  className="w-full px-2 py-1 border border-gray-300 rounded resize-y"
                                  rows={2}
                                  onChange={e => setEditFormData({ ...editFormData, alternate_names: e.target.value })}
                                />
                              ) : (
                                item.alternate_names
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" style={{ width: columnWidths[5], minWidth: 60, maxWidth: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {editingRowId === getRowId(item) ? (
                                <textarea
                                  value={editFormData.special_notes}
                                  className="w-full px-2 py-1 border border-gray-300 rounded resize-y"
                                  rows={3}
                                  onChange={e => setEditFormData({ ...editFormData, special_notes: e.target.value })}
                                />
                              ) : (
                                item.special_notes
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
