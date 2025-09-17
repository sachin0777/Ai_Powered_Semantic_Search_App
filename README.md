<div align="center">
  <img src="https://contentstack.io/assets/blt8eb5cbf1da4d544e/logo.png" alt="Contentstack Logo" width="120"/>
  <h1>🔍 Smart Semantic Search App</h1>
  <p>
    A Contentstack Marketplace App with <b>semantic search</b> powered by OpenAI, Cohere, and Pinecone.<br/>
    Built with React, Vite, Tailwind, Node.js — deployed on Vercel & integrated with Contentstack Launch.
  </p>

  <img src="https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB"/>
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white"/>
  <img src="https://img.shields.io/badge/TailwindCSS-38B2AC?style=flat&logo=tailwindcss&logoColor=white"/>
  <img src="https://img.shields.io/badge/Contentstack-EF5B25?style=flat&logo=contentstack&logoColor=white"/>
  <img src="https://img.shields.io/badge/Pinecone-2A2F4F?style=flat"/>
  <img src="https://img.shields.io/badge/OpenAI-412991?style=flat&logo=openai&logoColor=white"/>
  <img src="https://img.shields.io/badge/Cohere-000000?style=flat"/>
</div>

---

## ✨ Features

✔️ Semantic search across **text & images**  
✔️ Multi-model embeddings (**OpenAI + Cohere**)  
✔️ Real-time index updates with **Contentstack Webhooks**  
✔️ Built-in UI inside Contentstack (React + Tailwind)  
✔️ Scalable with **Pinecone Vector DB**  
✔️ Deployed with **Vercel + Launch**  

---

## 📸 Screenshots

<p align="center">
  <img src="Screenshot 2025-09-14 235142.png" alt="App UI" width="30%"/>
  <img src="Screenshot 2025-09-14 235223.png" alt="Search Results" width="30%"/>
  <img src="Screenshot 2025-09-14 235832.png" alt="Contentstack Integration" width="30%"/>
   <img src="Screenshot 2025-09-14 235847.png" alt="Contentstack Integration" width="30%"/>
</p>

---

## 🚀 Setup Instructions  

# 1. Clone the Repository
git clone https://github.com/sachin0777/Ai_Powered_Semantic_Search_App.git
cd Ai_Powered_Semantic_Search_App

# 2. Install Dependencies (from root)
npm install

# 3. Start the Frontend
cd frontend

npm install

npm run dev
# Frontend runs on: http://localhost:5173

# 4. Start the Backend (open new terminal)
cd backend

npm install

npm run dev
# Backend runs on: http://localhost:3000

# 5. Add Environment Variables (create .env in backend)
CONTENTSTACK_API_KEY=your_contentstack_api_key
CONTENTSTACK_DELIVERY_TOKEN=your_delivery_token
CONTENTSTACK_ENVIRONMENT=your_environment_name
OPENAI_API_KEY=your_openai_api_key
COHERE_API_KEY=your_cohere_api_key
PINECONE_API_KEY=your_pinecone_api_key

# 6. Deploy
# Frontend → Vercel
# Backend → Vercel serverless
# Contentstack Launch → Integrate app UI inside Contentstack
