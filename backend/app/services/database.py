import sqlite3
import os

def get_db_path(filename):
    from app.config import Config
    return os.path.join(Config.UPLOAD_FOLDER, filename)

def extract_schema(filename):
    """Dynamically extracts the schema of an SQLite database."""
    db_path = get_db_path(filename)
    if not os.path.exists(db_path):
        raise FileNotFoundError("Database not found")
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get all tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    
    schema = []
    for table_name in tables:
        table_name = table_name[0]
        schema.append(f"Table: {table_name}")
        schema.append("Columns:")
        
        # Get columns for each table
        cursor.execute(f"PRAGMA table_info('{table_name}')")
        columns = cursor.fetchall()
        for col in columns:
            schema.append(f"- {col[1]} ({col[2]})")
        schema.append("")
        
    conn.close()
    return "\n".join(schema)

def execute_query(filename, query):
    """Executes a SQL query on the specified database."""
    import time
    db_path = get_db_path(filename)
    if not os.path.exists(db_path):
        raise FileNotFoundError("Database not found")
        
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    start_time = time.time()
    try:
        cursor.execute(query)
        columns = [description[0] for description in cursor.description] if cursor.description else []
        results = cursor.fetchall()
        exec_time = round((time.time() - start_time) * 1000, 2)
        return {"columns": columns, "rows": results, "error": None, "exec_time_ms": exec_time}
    except Exception as e:
        exec_time = round((time.time() - start_time) * 1000, 2)
        return {"columns": [], "rows": [], "error": str(e), "exec_time_ms": exec_time}
    finally:
        conn.close()
