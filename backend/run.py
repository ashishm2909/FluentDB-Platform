from app import create_app
from app.services.logger import init_logger

app = create_app()
init_logger()

if __name__ == '__main__':
    app.run(debug=True, port=5002)
