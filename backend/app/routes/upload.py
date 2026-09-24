import os
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from app.config import Config

upload_bp = Blueprint('upload', __name__)

ALLOWED_EXTENSIONS = {'db', 'sqlite', 'sqlite3'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@upload_bp.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file.save(os.path.join(Config.UPLOAD_FOLDER, filename))
        return jsonify({"message": "File uploaded successfully", "filename": filename}), 200
    return jsonify({"error": "Invalid file type. Only SQLite databases are allowed."}), 400

@upload_bp.route('/api/databases', methods=['GET'])
def list_databases():
    files = []
    if os.path.exists(Config.UPLOAD_FOLDER):
        for f in os.listdir(Config.UPLOAD_FOLDER):
            if allowed_file(f):
                files.append(f)
    return jsonify({"databases": files}), 200

@upload_bp.route('/api/database/<filename>', methods=['DELETE'])
def delete_database(filename):
    if not allowed_file(filename):
        return jsonify({"error": "Invalid file type."}), 400
        
    filepath = os.path.join(Config.UPLOAD_FOLDER, secure_filename(filename))
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
            return jsonify({"message": "Database deleted successfully"}), 200
        except Exception as e:
            return jsonify({"error": f"Failed to delete file: {str(e)}"}), 500
    else:
        return jsonify({"error": "Database not found"}), 404
