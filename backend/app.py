import os
import sqlite3
from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

# Database Setup
DB_FILE = 'sample.db'

def setup_database():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            department TEXT NOT NULL,
            salary INTEGER,
            hire_date DATE
        )
    ''')
    cursor.execute('DELETE FROM employees') # Reset data
    sample_data = [
        ('Alice Smith', 'Engineering', 120000, '2021-03-15'),
        ('Bob Jones', 'Sales', 85000, '2022-01-10'),
        ('Charlie Brown', 'Engineering', 110000, '2021-11-20'),
        ('Diana Prince', 'Marketing', 95000, '2023-05-01'),
        ('Evan Wright', 'HR', 75000, '2020-08-14')
    ]
    cursor.executemany('INSERT INTO employees (name, department, salary, hire_date) VALUES (?, ?, ?, ?)', sample_data)
    conn.commit()
    conn.close()

setup_database()

def execute_query(query):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute(query)
        columns = [description[0] for description in cursor.description] if cursor.description else []
        results = cursor.fetchall()
        conn.close()
        return {"columns": columns, "rows": results, "error": None}
    except Exception as e:
        conn.close()
        return {"columns": [], "rows": [], "error": str(e)}

@app.route('/api/query', methods=['POST'])
def query_database():
    if not client:
        return jsonify({"error": "Groq API Key not configured on the server."}), 500
        
    data = request.json
    natural_language_query = data.get('query', '')
    
    if not natural_language_query:
        return jsonify({"error": "No query provided."}), 400

    schema_context = """
    Table: employees
    Columns:
    - id (INTEGER PRIMARY KEY)
    - name (TEXT)
    - department (TEXT)
    - salary (INTEGER)
    - hire_date (DATE)
    """

    prompt = f"""
    You are an expert SQL assistant. Convert the following natural language request into a valid SQL query for SQLite.
    Only return the SQL query, nothing else. No markdown formatting, no explanation.

    Schema:
    {schema_context}

    Request: {natural_language_query}
    """

    try:
        completion = client.chat.completions.create(
            messages=[
                {"role": "user", "content": prompt}
            ],
            model="openai/gpt-oss-120b",
            temperature=0,
            max_tokens=150,
        )
        sql_query = completion.choices[0].message.content.strip()
        # Remove any markdown backticks if the model accidentally included them
        sql_query = sql_query.replace('```sql', '').replace('```', '').strip()
        
        result = execute_query(sql_query)
        return jsonify({
            "sql_query": sql_query,
            "result": result
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)
