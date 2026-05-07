"""Application-level constants for the Expense Report Web App."""

CLIENTS: list[str] = [
    "Acme Corp",
    "Globex Industries",
    "Initech",
    "Umbrella Ltd",
    "Hooli",
]

# ---------------------------------------------------------------------------
# Attachment validation constants
# ---------------------------------------------------------------------------

# Allowed MIME types for file uploads (7 approved types).
ALLOWED_MIME_TYPES: set[str] = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/msword",  # .doc
    "application/vnd.google-apps.document",  # .gdoc
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "application/vnd.ms-excel",  # .xls
    "application/vnd.google-apps.spreadsheet",  # .gsheet
}

# Allowed file extensions (must match an entry in ALLOWED_MIME_TYPES).
ALLOWED_EXTENSIONS: set[str] = {
    ".pdf",
    ".docx",
    ".doc",
    ".gdoc",
    ".xlsx",
    ".xls",
    ".gsheet",
}

# Maximum attachment size: 10 MB in bytes.
MAX_FILE_SIZE: int = 10 * 1024 * 1024
