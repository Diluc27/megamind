import os
from slugify import slugify
from .paths import SHELFD_DIR


def ensure_shelfd_dirs():
    if not os.path.exists(SHELFD_DIR):
        os.makedirs(SHELFD_DIR)


def build_shelfd_markdown(title, tags, created_at, updated_at, content):
    return (
        "---\n"
        f"title: {title}\n"
        f"tags: {tags}\n"
        f"created_at: {created_at}\n"
        f"updated_at: {updated_at}\n"
        "---\n\n"
        f"{content}"
    )


def extract_shelfd_body(markdown_text):
    if not markdown_text.startswith("---"):
        return markdown_text
    parts = markdown_text.split("---", 2)
    if len(parts) >= 3:
        return parts[2].lstrip()
    return markdown_text


def get_safe_shelfd_filename(title, shelfd_id):
    base_slug = slugify(title)
    filename = f"{base_slug}-{shelfd_id}.md"
    file_path = os.path.join(SHELFD_DIR, filename)
    counter = 1
    while os.path.exists(file_path):
        counter += 1
        filename = f"{base_slug}-{shelfd_id}-{counter}.md"
        file_path = os.path.join(SHELFD_DIR, filename)
    return file_path


def save_shelfd_markdown(file_path, content):
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)


def read_shelfd_markdown(file_path):
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def delete_shelfd_markdown(file_path):
    if file_path and os.path.exists(file_path):
        os.remove(file_path)
