from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import init_db
from .utils import ensure_dirs
from .routes import router

app = FastAPI(title="MegaMind: Digital Brain")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    ensure_dirs()
    init_db()

@app.get("/")
def read_root():
    return {"status": "MegaMind Backend is running"}

app.include_router(router, prefix="/api")
