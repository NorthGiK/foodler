from uvicorn import run

if __name__ == "__main__":
    run("src.main:app", host="127.0.0.1", workers=1)
