from flask import Flask
from flask_cors import CORS
from app.config import Config

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app)
    
    Config.init_app(app)
    
    from app.routes.upload import upload_bp
    from app.routes.query import query_bp
    
    app.register_blueprint(upload_bp)
    app.register_blueprint(query_bp)
    
    from werkzeug.exceptions import RequestEntityTooLarge
    from flask import jsonify

    @app.errorhandler(RequestEntityTooLarge)
    def handle_payload_too_large(e):
        return jsonify({"error": "File exceeds the 200MB production upload limit."}), 413
    
    return app
