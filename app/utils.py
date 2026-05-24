import os
from slugify import slugify

DATA_DIR = "data"
NOTES_DIR = os.path.join(DATA_DIR, "notes")
CATEGORIES = [
    "Projects", "Errors-Fixes", "Prompts", "Tools-Models",
    "Ideas", "Learning-Logs", "Commands"
]


def ensure_dirs():
    dirs = [DATA_DIR, NOTES_DIR, "backups"]
    for cat in CATEGORIES:
        dirs.append(os.path.join(NOTES_DIR, cat))

    for d in dirs:
        if not os.path.exists(d):
            os.makedirs(d)


def normalize_tags(tags):
    if not tags:
        return ""
    return ",".join(tag.strip().lower() for tag in tags.split(",") if tag.strip())


def build_markdown(title, category, tags, created_at, updated_at, content):
    return (
        f"# {title}\n\n"
        f"Category: {category}\n"
        f"Tags: {tags}\n"
        f"Created: {created_at}\n"
        f"Updated: {updated_at}\n\n"
        "---\n\n"
        f"{content}"
    )


def extract_body(markdown_text):
    if "---" not in markdown_text:
        return markdown_text
    return markdown_text.split("---", 1)[1].lstrip()


def build_preview(content, length=200):
    body = " ".join(extract_body(content).split())
    return body[:length]


def get_safe_filename(title, note_id, category):
    base_slug = slugify(title)
    filename = f"{base_slug}-{note_id}.md"

    cat_dir = os.path.join(NOTES_DIR, category) if category in CATEGORIES else NOTES_DIR
    file_path = os.path.join(cat_dir, filename)

    # Handle collisions (though ID should prevent most)
    counter = 1
    while os.path.exists(file_path):
        counter += 1
        filename = f"{base_slug}-{note_id}-{counter}.md"
        file_path = os.path.join(cat_dir, filename)

    return file_path


def save_markdown(file_path, content):
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)


def read_markdown(file_path):
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def delete_markdown(file_path):
    if file_path and os.path.exists(file_path):
        os.remove(file_path)
