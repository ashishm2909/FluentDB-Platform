from app import create_app
from app.services.logger import init_logger

app = create_app()

if __name__ == '__main__':
    init_logger()
    app.run(debug=True, port=5002)
