from datetime import datetime

STOP_WORDS = {
    "what", "do", "i", "know", "about", "the", "a", "an", "is", "are",
    "to", "of", "and", "or", "in", "on", "for", "with", "how", "it",
    "that", "this", "my", "you", "we", "they", "he", "she", "me",
    "did", "be", "have", "has", "had", "not", "no", "but", "was", "were",
    "will", "would", "can", "could", "should", "all", "any", "each",
    "from", "by", "at", "as", "if", "so", "than", "then", "just",
    "also", "very", "too", "really", "some", "there", "their", "them"
}

STOP_WORDS = {w.strip().lower() for w in STOP_WORDS}

PUNCTUATION = """?!.,:;'"()[]{}"""


def tokenize_query(query):
    words = query.lower().split()
    tokens = []
    for w in words:
        w = w.strip(PUNCTUATION)
        if w and w not in STOP_WORDS:
            tokens.append(w)
    if not tokens:
        cleaned = query.strip().lower().strip(PUNCTUATION)
        if cleaned:
            tokens = [cleaned]
    return tokens


def score_note(query_tokens, note, content):
    score = 0

    title = note.title.lower()
    tags = (note.tags or "").lower()
    category = (note.category or "").lower()
    content_lower = content.lower()

    matched_tokens = 0
    for token in query_tokens:
        token_matched = False

        # Exact title match: +8
        if token == title:
            score += 8
            token_matched = True
        # Partial title match: +5
        elif token in title:
            score += 5
            token_matched = True

        # Tag match: +4
        if token in tags:
            score += 4
            token_matched = True

        # Category match: +3
        if token in category:
            score += 3
            token_matched = True

        # Heading match: +2
        if f"# {token}" in content_lower or f"## {token}" in content_lower:
            score += 2
            token_matched = True

        # Body content match: +1
        if token in content_lower:
            score += 1
            token_matched = True

        if token_matched:
            matched_tokens += 1

    if matched_tokens == 0:
        return 0

    if len(query_tokens) > 1:
        score += matched_tokens * 2

    if note.updated_at:
        delta = datetime.now() - note.updated_at
        if delta.days == 0:
            score += 1

    return score


def perform_search(query, notes_with_content):
    tokens = tokenize_query(query)
    if not tokens:
        return []

    results = []
    for note, content in notes_with_content:
        score = score_note(tokens, note, content)
        if score > 0:
            results.append({
                "note": note,
                "score": score,
                "content": content
            })

    results.sort(key=lambda x: (x["score"], x["note"].updated_at or datetime.min, x["note"].id), reverse=True)
    return results
