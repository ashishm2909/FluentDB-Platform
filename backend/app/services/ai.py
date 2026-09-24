from groq import Groq
from app.config import Config
import time
import json

client = Groq(api_key=Config.GROQ_API_KEY) if Config.GROQ_API_KEY else None

def generate_sql(schema_context, natural_language_query, history=None):
    if not client: raise Exception("Groq API Key not configured.")
    start_time = time.time()
    
    history_text = ""
    if history and len(history) > 0:
        history_text = "\nPREVIOUS CONTEXT:\n" + "\n".join([f"User: {h['user']}\nSQL: {h['sql']}" for h in history])

    prompt = f"""
    You are an expert, highly intelligent SQL data analyst. Convert the user's natural language request into a valid SQL query for SQLite.
    
    CRITICAL RULES:
    1. ONLY return the SQL query. No markdown, no explanation.
    2. TEXT SEARCHES: Use case-insensitive partial matching (LOWER(col) LIKE '%val%').
    3. Use JOINs/COALESCE where needed. Map missing columns intelligently.
    {history_text}

    Schema:
    {schema_context}

    Request: {natural_language_query}
    """

    completion = client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="openai/gpt-oss-120b",
        temperature=0, max_tokens=250,
    )
    
    inference_time = round((time.time() - start_time) * 1000, 2)
    sql_query = completion.choices[0].message.content.strip().replace('```sql', '').replace('```', '').strip()
    usage = completion.usage
    return sql_query, {
        "inference_latency_ms": inference_time,
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0
    }

def heal_sql(schema_context, query, wrong_sql, error_msg):
    start_time = time.time()
    prompt = f"""
    You are an expert SQL debugger. The following SQL query failed with an error. Fix it.
    ONLY return the corrected SQL query. No markdown, no explanation.

    Schema:
    {schema_context}

    Original Request: {query}
    Failed SQL: {wrong_sql}
    Error Message: {error_msg}
    """
    completion = client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="openai/gpt-oss-120b",
        temperature=0, max_tokens=250,
    )
    sql_query = completion.choices[0].message.content.strip().replace('```sql', '').replace('```', '').strip()
    return sql_query

def generate_insights(query, data):
    prompt = f"""
    You are a data analyst presenting results to an executive. 
    User asked: "{query}"
    Data returned: {json.dumps(data)[:1000]} (truncated if too long)
    
    Provide a very brief (1-2 sentences), insightful, human-readable summary of this data. Do not mention SQL or databases.
    """
    completion = client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="openai/gpt-oss-120b",
        temperature=0.5, max_tokens=150,
    )
    return completion.choices[0].message.content.strip()
