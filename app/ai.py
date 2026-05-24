from typing import List, Tuple
from .models import Note
from .utils import read_markdown

def local_ask(question: str, notes: List[Note]) -> str:
    """
    Placeholder for local AI logic. 
    In the future, this could use RAG with a local LLM.
    """
    # Simple keyword extraction for demonstration
    keywords = question.lower().split()
    relevant_notes = []
    
    for note in notes:
        content = read_markdown(note.file_path).lower()
        if any(kw in note.title.lower() or kw in content for kw in keywords):
            relevant_notes.append(note.title)
    
    if not relevant_notes:
        return f"I couldn't find any specific notes related to '{question}'."
        
    titles = ", ".join(relevant_notes[:5])
    return f"Based on your notes, you might want to look at: {titles}. (AI integration pending)"
