from flask import Blueprint, request, jsonify
from app.services.database import extract_schema, execute_query
from app.services.ai import generate_sql, heal_sql, generate_insights
from app.services.logger import log_query, get_logs, get_cached_sql

query_bp = Blueprint('query', __name__)

@query_bp.route('/api/generate_sql', methods=['POST'])
def generate_sql_endpoint():
    data = request.json
    database_name = data.get('database')
    natural_language_query = data.get('query', '')
    history = data.get('history', [])
    
    if not database_name or not natural_language_query:
        return jsonify({"error": "Missing database or query."}), 400

    try:
        # Intercept schema queries to avoid LLM hallucinations and save time
        query_lower = natural_language_query.lower().strip()
        if query_lower in ["show db", "show tables", "list tables", "what tables are there", "tables"]:
            return jsonify({
                "database": database_name,
                "sql_query": "SELECT name as table_name FROM sqlite_master WHERE type='table';",
                "ai_metrics": {"inference_latency_ms": 0, "prompt_tokens": 0, "completion_tokens": 0},
                "complexity": "Low",
                "source": "SYSTEM"
            })

        # Check cache first
        cached = get_cached_sql(database_name, natural_language_query)
        if cached:
            return jsonify({
                "database": database_name,
                "sql_query": cached["sql_query"],
                "ai_metrics": {"inference_latency_ms": 0, "prompt_tokens": 0, "completion_tokens": 0},
                "complexity": cached["complexity"],
                "source": "CACHE"
            })

        # Not in cache, call LLM
        schema_context = extract_schema(database_name)
        api_key = data.get('api_key')
        sql_query, ai_metrics = generate_sql(schema_context, natural_language_query, history, api_key)
        
        if sql_query.startswith("ERROR:"):
            return jsonify({"error": sql_query.replace("ERROR:", "").strip()}), 400
        
        complexity = "Low"
        if "JOIN" in sql_query.upper(): complexity = "Medium"
        if "WITH" in sql_query.upper() or sql_query.upper().count("SELECT") > 1: complexity = "High"

        return jsonify({
            "database": database_name,
            "sql_query": sql_query,
            "ai_metrics": ai_metrics,
            "complexity": complexity,
            "source": "LLM"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@query_bp.route('/api/heal_sql', methods=['POST'])
def heal_sql_endpoint():
    data = request.json
    database_name = data.get('database')
    original_query = data.get('query')
    wrong_sql = data.get('wrong_sql')
    error_msg = data.get('error_msg')
    
    try:
        schema_context = extract_schema(database_name)
        api_key = data.get('api_key')
        fixed_sql = heal_sql(schema_context, original_query, wrong_sql, error_msg, api_key)
        return jsonify({"fixed_sql": fixed_sql})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@query_bp.route('/api/execute_sql', methods=['POST'])
def execute_sql_endpoint():
    data = request.json
    database_name = data.get('database')
    sql_query = data.get('sql_query', '')
    
    if not database_name or not sql_query:
        return jsonify({"error": "Missing database or SQL query."}), 400

    try:
        result = execute_query(database_name, sql_query)
        
        # Determine operation type for UI messaging
        query_upper = sql_query.upper()
        op_type = "SELECT"
        if "DELETE" in query_upper or "DROP" in query_upper:
            op_type = "DELETE"
        elif "UPDATE" in query_upper:
            op_type = "UPDATE"
        elif "INSERT" in query_upper:
            op_type = "INSERT"
            
        return jsonify({"result": result, "op_type": op_type})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@query_bp.route('/api/insights', methods=['POST'])
def insights_endpoint():
    data = request.json
    try:
        insight = generate_insights(data.get('query'), data.get('data'), data.get('api_key'))
        return jsonify({"insight": insight})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

from app.services.logger import log_query, get_logs

@query_bp.route('/api/log_query', methods=['POST'])
def save_log_endpoint():
    data = request.json
    try:
        log_query(
            data.get('database'), data.get('user_query'), data.get('sql_query'),
            data.get('ai_latency'), data.get('db_latency'), data.get('prompt_tokens'),
            data.get('completion_tokens'), data.get('complexity'), data.get('status'),
            data.get('source', 'LLM'), data.get('cost', 0.0)
        )
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@query_bp.route('/api/logs', methods=['GET'])
def get_logs_endpoint():
    try:
        return jsonify({"logs": get_logs()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
