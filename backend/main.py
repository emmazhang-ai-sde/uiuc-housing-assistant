from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rag.rag_chain import chain, retriever

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this to your Vercel domain before launch
    allow_methods=["POST"],
    allow_headers=["*"],
)

class SearchRequest(BaseModel):
    query: str

@app.post("/api/search")
def search(req: SearchRequest):
    answer = chain.invoke(req.query)
    docs   = retriever.invoke(req.query)
    listings = [doc.metadata for doc in docs]
    return { "answer": answer, "listings": listings }