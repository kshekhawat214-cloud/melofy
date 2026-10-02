import os
import gradio as gr
import uvicorn
from main import app as fastapi_app

# Gradio status interface for the Hugging Face Space viewer
with gr.Blocks(title="Melofy Music Backend") as demo:
    gr.Markdown("# 🎵 Melofy Music Smart Engine")
    gr.Markdown("The backend API powering Tunely (Spotify Clone) is running successfully.")
    gr.Markdown("""
    ### 🚀 API Endpoints
    - **GET `/api/songs`**: Full catalog of songs with metadata
    - **GET `/api/songs/{id}/stream`**: Smart On-Demand Audio Streamer (HTTP 206)
    - **GET `/api/playlists`**: Playlists and track collections
    - **GET `/api/home/{user_id}`**: Personalized recommendation feed
    - **GET `/docs`**: Interactive Swagger API Documentation
    """)

# Mount Gradio onto the FastAPI app
app = gr.mount_gradio_app(fastapi_app, demo, path="/")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
