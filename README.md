# GBID Pinecone Uploader

A modern web application for uploading GBID materials to a Pinecone vector database. Built with Next.js, React, and Tailwind CSS.

## Features

- **Single Item Upload**: Add individual items with Name, GBID, Properties, Alternate Names, and Special Notes
- **Batch Upload**: Upload multiple items via CSV file
- **Dynamic Properties**: Add unlimited custom property fields
- **Real-time Logging**: See upload progress and status
- **Modern UI**: Clean, responsive interface built with Tailwind CSS

## Prerequisites

- Node.js 18+ 
- Pinecone account and API key
- OpenAI API key
- Pinecone index named "gbid-database"

## Setup

### 1. Clone/Download the Project

Download the project files to your local machine.

### 2. Install Dependencies

```bash
cd gbid-uploader
npm install
```

### 3. Environment Variables

Create a `.env.local` file in the root directory:

```env
PINECONE_API_KEY=your_pinecone_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
PINECONE_INDEX=gbid-database
```

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Deployment to Vercel

### 1. Push to GitHub

1. Create a new repository on GitHub
2. Push your code to the repository

### 2. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Sign up/Login with your GitHub account
3. Click "New Project"
4. Import your GitHub repository
5. Configure the project settings

### 3. Set Environment Variables on Vercel

In your Vercel project dashboard:

1. Go to **Settings** → **Environment Variables**
2. Add the following variables:
   - `PINECONE_API_KEY`: Your Pinecone API key
   - `OPENAI_API_KEY`: Your OpenAI API key  
   - `PINECONE_INDEX`: `gbid-database`

3. Deploy the project

## Usage

### Single Upload

1. Fill in the required fields (Name and GBID)
2. Add any properties using the "Add Property" button
3. Optionally add Alternate Names and Special Notes
4. Click "Upload Item"

### Batch Upload

1. Prepare a CSV file with the following columns:
   - `Name` (required)
   - `GBID` (required)
   - `Properties` (optional)
   - `Alternate Names` (optional)
   - `Special Notes` (optional)

2. Click "Batch Upload (CSV)" and select your file
3. The app will process and upload each item

### CSV Format Example

```csv
Name,GBID,Properties,Alternate Names,Special Notes
RIGID COUPLINGS,88254013,1/2 inch,GALV COUPLINGS,Standard
WIRE,12345678,500 feet,ELECTRICAL WIRE,Copper
```

## API Endpoints

### POST /api/upload

Uploads a single item to Pinecone.

**Request Body:**
```json
{
  "type": "single",
  "data": {
    "name": "Item Name",
    "gbid": "12345678",
    "properties": "Property 1; Property 2",
    "alternateNames": "Alt Name 1, Alt Name 2",
    "specialNotes": "Special instructions"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully uploaded Item Name (12345678)"
}
```

## Technical Details

- **Frontend**: Next.js with React and Tailwind CSS
- **Backend**: Next.js API routes
- **Database**: Pinecone vector database
- **Embeddings**: OpenAI text-embedding-3-large model
- **CSV Parsing**: PapaParse library

## Troubleshooting

### Common Issues

1. **"Pinecone API key not configured"**
   - Check that your environment variables are set correctly
   - Ensure the variable names match exactly

2. **"OpenAI API key not configured"**
   - Verify your OpenAI API key is valid and has credits
   - Check environment variable setup

3. **CSV upload fails**
   - Ensure your CSV has the required columns (Name, GBID)
   - Check that the CSV file is properly formatted

4. **Build errors on Vercel**
   - Make sure all environment variables are set in Vercel dashboard
   - Check that the Node.js version is compatible

## Support

For issues or questions, check the upload log in the app for detailed error messages. 