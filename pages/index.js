import { useState } from 'react';
import Head from 'next/head';
import Papa from 'papaparse';

export default function Home() {
  const [formData, setFormData] = useState({
    name: '',
    gbid: '',
    alternateNames: '',
    specialNotes: ''
  });
  const [properties, setProperties] = useState(['']);
  const [isUploading, setIsUploading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [uploadMode, setUploadMode] = useState('single'); // 'single' or 'batch'

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
    if (!formData.name || !formData.gbid) {
      addLog('Error: Name and GBID are required');
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
        setFormData({ name: '', gbid: '', alternateNames: '', specialNotes: '' });
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
        const requiredCols = ['Name', 'GBID'];
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

          if (!name || !gbid) {
            addLog(`Skipping row ${i + 1}: missing Name or GBID`);
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
            </div>
          </div>

          {uploadMode === 'single' ? (
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
          ) : (
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
                      CSV should have columns: Name, GBID, Properties, Alternate Names, Special Notes
                    </p>
                  </div>
                </label>
              </div>
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