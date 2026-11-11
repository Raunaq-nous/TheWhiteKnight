# File header

Every new or substantially changed source file starts with a short header. It answers three
questions for someone opening the file cold: what is this for, what uses it, and what must I be
careful about. Keep it to three to six lines; the detailed notes live in `docs/clarity/`.

Python:

    """Turns a cost spreadsheet (CSV) into rows and finds projects that are over budget.

    Used by: app.py (home page and upload), tests/test_costs.py.
    Careful: a zero budget is skipped, not flagged, to avoid dividing by zero.
    """

TypeScript or JavaScript:

    // Shows the chosen file name and stops non-CSV uploads before they are sent.
    // Used by: the upload form rendered in app.py.
    // Careful: this is a convenience check only; the server must still validate uploads.

SQL:

    -- Creates the projects table: one row per capital project with its budget.
    -- Used by: src/db/projects.ts.
    -- Careful: budget is stored in whole cents to avoid rounding errors.
