import os
import uuid
from datetime import datetime, timezone

from flask import Flask, jsonify, render_template, request
from dotenv import load_dotenv

from google import genai
from google.genai import types

import firebase_admin
from firebase_admin import credentials, firestore

from chatbot_config import APP_NAME, SYSTEM_PROMPT


# ============================================================
# LOAD ENVIRONMENT VARIABLES
# ============================================================

load_dotenv()


# ============================================================
# FLASK APP
# ============================================================

app = Flask(__name__)


# ============================================================
# GEMINI
# ============================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

gemini_client = None

if GEMINI_API_KEY:

    try:
        gemini_client = genai.Client(
            api_key=GEMINI_API_KEY
        )

        print("Gemini API connected successfully.")

    except Exception as error:
        print("Gemini initialization error:", error)

else:
    print("ERROR: GEMINI_API_KEY not found.")


# ============================================================
# FIREBASE
# ============================================================

db = None

try:

    firebase_credentials = os.getenv(
        "FIREBASE_CREDENTIALS",
        "firebase_service_account.json"
    )

    if os.path.exists(firebase_credentials):

        if not firebase_admin._apps:

            cred = credentials.Certificate(
                firebase_credentials
            )

            firebase_admin.initialize_app(cred)

        db = firestore.client()

        print("Firebase Firestore connected successfully.")

    else:

        print(
            "ERROR: Firebase service account file not found:"
        )

        print(firebase_credentials)

except Exception as error:

    print("Firebase initialization error:", error)


# ============================================================
# HOME
# ============================================================

@app.route("/")
def home():

    return render_template(
        "index.html",
        app_name=APP_NAME
    )


# ============================================================
# HEALTH
# ============================================================

@app.route("/health")
def health():

    return jsonify({

        "status": "ok",

        "application": APP_NAME,

        "gemini": gemini_client is not None,

        "firestore": db is not None

    })


# ============================================================
# GEMINI RESPONSE
# ============================================================

def generate_ai_response(
    user_message,
    conversation_history=None
):

    if gemini_client is None:

        raise RuntimeError(
            "Gemini client is not initialized."
        )


    if conversation_history is None:

        conversation_history = []


    # --------------------------------------------------------
    # BUILD HISTORY
    # --------------------------------------------------------

    recent_history = conversation_history[-10:]

    history_text = ""

    for message in recent_history:

        role = message.get(
            "role",
            "user"
        )

        text = message.get(
            "text",
            ""
        )

        if not text:
            continue

        if role == "assistant":

            history_text += (
                f"FoodWise AI: {text}\n"
            )

        else:

            history_text += (
                f"User: {text}\n"
            )


    # --------------------------------------------------------
    # PROMPT
    # --------------------------------------------------------

    prompt = f"""
{SYSTEM_PROMPT}

Previous conversation:

{history_text}

Current user question:

{user_message}

Answer the user as FoodWise AI.
Keep the answer friendly, clear and useful.
"""


    # --------------------------------------------------------
    # GEMINI API
    # --------------------------------------------------------

    print()
    print("Sending request to Gemini...")
    print("User message:", user_message)


    response = gemini_client.models.generate_content(

        model="gemini-3.6-flash",

        contents=prompt,

        config=types.GenerateContentConfig(

            system_instruction=SYSTEM_PROMPT,

            temperature=0.7,

            max_output_tokens=800

        )

    )


    # --------------------------------------------------------
    # CHECK RESPONSE
    # --------------------------------------------------------

    if not response:

        raise RuntimeError(
            "Gemini returned an empty response."
        )


    if not response.text:

        raise RuntimeError(
            "Gemini response contains no text."
        )


    print("Gemini response received successfully.")

    return response.text.strip()


# ============================================================
# FIRESTORE SAVE
# ============================================================

def save_chat_to_firestore(
    conversation_id,
    user_message,
    assistant_message
):

    if db is None:

        print(
            "Firestore unavailable. "
            "Skipping chat save."
        )

        return


    try:

        conversation_ref = (

            db
            .collection(
                "foodwise_conversations"
            )
            .document(
                conversation_id
            )

        )


        # Conversation information

        conversation_ref.set(

            {

                "conversation_id":
                    conversation_id,

                "app":
                    APP_NAME,

                "updated_at":
                    datetime.now(
                        timezone.utc
                    )

            },

            merge=True

        )


        # User message

        conversation_ref \
            .collection("messages") \
            .add(

                {

                    "role":
                        "user",

                    "text":
                        user_message,

                    "timestamp":
                        datetime.now(
                            timezone.utc
                        )

                }

            )


        # AI message

        conversation_ref \
            .collection("messages") \
            .add(

                {

                    "role":
                        "assistant",

                    "text":
                        assistant_message,

                    "timestamp":
                        datetime.now(
                            timezone.utc
                        )

                }

            )


        print(
            "Chat saved to Firestore successfully."
        )


    except Exception as error:

        print(
            "Firestore save error:",
            error
        )


# ============================================================
# CHAT API
# ============================================================

@app.route(
    "/api/chat",
    methods=["POST"]
)
def chat():

    try:

        data = request.get_json(
            silent=True
        ) or {}


        user_message = str(
            data.get(
                "message",
                ""
            )
        ).strip()


        conversation_id = str(
            data.get(
                "conversation_id",
                ""
            )
        ).strip()


        conversation_history = data.get(
            "history",
            []
        )


        # ----------------------------------------------------
        # VALIDATION
        # ----------------------------------------------------

        if not user_message:

            return jsonify({

                "success": False,

                "error":
                    "Please enter a message."

            }), 400


        if len(user_message) > 4000:

            return jsonify({

                "success": False,

                "error":
                    "Message is too long."

            }), 400


        # ----------------------------------------------------
        # CONVERSATION ID
        # ----------------------------------------------------

        if not conversation_id:

            conversation_id = str(
                uuid.uuid4()
            )


        # ----------------------------------------------------
        # GENERATE RESPONSE
        # ----------------------------------------------------

        assistant_message = generate_ai_response(

            user_message,

            conversation_history

        )


        # ----------------------------------------------------
        # SAVE
        # ----------------------------------------------------

        save_chat_to_firestore(

            conversation_id,

            user_message,

            assistant_message

        )


        # ----------------------------------------------------
        # RETURN
        # ----------------------------------------------------

        return jsonify({

            "success": True,

            "conversation_id":
                conversation_id,

            "reply":
                assistant_message

        })


    except Exception as error:

        # IMPORTANT:
        # Print the REAL error in terminal.

        print()
        print("======================================")
        print("FOODWISE CHAT ERROR")
        print("======================================")
        print(type(error).__name__)
        print(str(error))
        print("======================================")
        print()


        # During development, send the real error
        # to the browser so we can identify it.

        return jsonify({

            "success": False,

            "error":
                f"{type(error).__name__}: {str(error)}"

        }), 500


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":

    port = int(
        os.getenv(
            "PORT",
            5000
        )
    )


    print()
    print("======================================")
    print("       FOODWISE AI")
    print("======================================")

    print(
        "Gemini:",
        "Connected"
        if gemini_client
        else "NOT CONNECTED"
    )

    print(
        "Firestore:",
        "Connected"
        if db
        else "NOT CONNECTED"
    )

    print(
        f"Running on port {port}"
    )

    print("======================================")
    print()


    app.run(

        host="0.0.0.0",

        port=port,

        debug=True

    )