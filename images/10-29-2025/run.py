import cv2
import mediapipe as mp
import pygame
import numpy as np
import os

# === 🎧 Low-latency audio setup ===
pygame.mixer.pre_init(44100, -16, 2, 512)
pygame.mixer.init()
pygame.mixer.set_num_channels(16)  # allow multiple notes
string_channels = [pygame.mixer.Channel(i) for i in range(6)]  # one channel per string

# === MediaPipe setup ===
mp_pose = mp.solutions.pose
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles 

pose = mp_pose.Pose()
hands = mp_hands.Hands(max_num_hands=1, min_detection_confidence=0.7)
selected_pose_indices = [19]   # Pose landmark for strumming hand (usually right wrist)

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
cv2.namedWindow('MediaPipe Pose + Hands', cv2.WND_PROP_FULLSCREEN)
cv2.setWindowProperty('MediaPipe Pose + Hands', cv2.WINDOW_FULLSCREEN, cv2.WINDOW_FULLSCREEN)

# === 🎸 Chord system setup ===
CHORD_MAP = {
    "1": "C",
    "2": "Dm",
    "3": "Em",
    "4": "F",
    "5": "G",
    "6": "Am",
    "7": "Bdim"
}
chord_folder_path = "chords"
current_chord = None
current_mode = None
string_sounds = [None] * 6  # 6 strings

# === String visuals ===
num_strings = 6
spacing = 15
string_labels = ["E", "A", "D", "G", "B", "E"]
string_colors = [(200, 200, 200)] * num_strings
string_hit_time = [0] * num_strings
color_duration = 10
frame_count = 0
prev_strum_y = None

# === Load chord WAVs ===
def load_chord_sounds(chord_name, mode="acoustic"):
    global string_sounds
    chord_path = os.path.join(chord_folder_path, mode, chord_name)
    if not os.path.exists(chord_path):
        print(f"⚠️ Missing {mode} chord folder: {chord_path}")
        string_sounds = [None] * 6
        return

    string_sounds = []
    for i in range(6):
        wav_path = os.path.join(chord_path, f"string{i+1}.wav")
        if os.path.exists(wav_path):
            sound = pygame.mixer.Sound(wav_path)
            sound.set_volume(0.8 if mode == "distorted" else 0.7)
            string_sounds.append(sound)
        else:
            string_sounds.append(None)
            print(f"⚠️ Missing sound file: {wav_path}")
    print(f"🎵 Loaded {mode} chord: {chord_name}")

# === Detect chord gesture & mode ===
def detect_hand_gesture(hand_landmarks):
    thumb_tip = hand_landmarks.landmark[4]
    thumb_ip = hand_landmarks.landmark[3]
    thumb_mcp = hand_landmarks.landmark[2]
    tips = [8, 12, 16, 20]
    pips = [6, 10, 14, 18]

    thumb_open = thumb_tip.x < thumb_ip.x < thumb_mcp.x
    y_tips = [hand_landmarks.landmark[i].y for i in tips]
    y_pips = [hand_landmarks.landmark[i].y for i in pips]
    fingers_up = [y_tips[i] < y_pips[i] for i in range(4)]
    hand_pattern = (thumb_open, *fingers_up)

    acoustic_patterns = {
        (False, True, False, False, False): ("1", "acoustic"),
        (False, True, True, False, False): ("2", "acoustic"),
        (False, True, True, True, False): ("3", "acoustic"),
        (False, True, True, True, True): ("4", "acoustic"),
        (False, False, False, False, True): ("5", "acoustic"),
        (False, False, False, True, True): ("6", "acoustic"),
        (False, False, True, True, True): ("7", "acoustic"),
    }
    distorted_patterns = {
        (True, True, False, False, False): ("1", "distorted"),
        (True, True, True, False, False): ("2", "distorted"),
        (True, True, True, True, False): ("3", "distorted"),
        (True, True, True, True, True): ("4", "distorted"),
        (True, False, False, False, True): ("5", "distorted"),
        (True, False, False, True, True): ("6", "distorted"),
        (True, False, True, True, True): ("7", "distorted"),
    }

    if hand_pattern in acoustic_patterns:
        return acoustic_patterns[hand_pattern]
    elif hand_pattern in distorted_patterns:
        return distorted_patterns[hand_pattern]
    else:
        return ("Unknown", None)

# === Main Loop ===
while cap.isOpened():
    success, frame = cap.read()
    if not success:
        continue

    frame = cv2.flip(frame, 1)
    h, w, _ = frame.shape
    left_frame = frame[:, :w // 2]

    image_rgb_left = cv2.cvtColor(left_frame, cv2.COLOR_BGR2RGB)
    image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    hand_results = hands.process(image_rgb_left)
    pose_results = pose.process(image_rgb)

    strum_y = None
    strum_x = None
    chord_from_hand = None
    mode_from_hand = None

    # 🎸 Detect chord hand
    if hand_results.multi_hand_landmarks:
        for hl in hand_results.multi_hand_landmarks:
            mp_drawing.draw_landmarks(
                left_frame, hl, mp_hands.HAND_CONNECTIONS,
                mp_drawing_styles.get_default_hand_landmarks_style(),
                mp_drawing_styles.get_default_hand_connections_style()
            )
            gesture_label, mode_from_hand = detect_hand_gesture(hl)
            cv2.putText(left_frame, f"Gesture: {gesture_label} ({mode_from_hand or 'N/A'})",
                        (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)
            if gesture_label in CHORD_MAP and mode_from_hand:
                chord_from_hand = CHORD_MAP[gesture_label]

    # Load new chord
    if chord_from_hand and (chord_from_hand != current_chord or mode_from_hand != current_mode):
        current_chord = chord_from_hand
        current_mode = mode_from_hand
        load_chord_sounds(current_chord, current_mode)

    # ✋ Detect strumming hand position
    if pose_results.pose_landmarks:
        lm = pose_results.pose_landmarks.landmark
        for i in selected_pose_indices:
            x = int(lm[i].x * w)
            y = int(lm[i].y * h)
            strum_x, strum_y = x, y
            color = (0, 255, 255) if current_mode == "distorted" else (0, 255, 0)
            cv2.circle(frame, (x, y), 8, color, -1)
            cv2.putText(frame, f'{current_chord or "None"} ({current_mode or "N/A"})',
                        (x + 10, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    # 🎵 Detect strum crossings (only inside string region)
    mid_y = h // 2
    start_x = int(w * 0.45)
    end_x = int(w * 0.70)
    start_y = mid_y - (num_strings // 2) * spacing

    # Draw string region (optional visualization)
    cv2.rectangle(frame, (start_x - 10, start_y - 20),
                  (end_x + 10, start_y + num_strings * spacing + 20),
                  (50, 50, 50), 2)

    if (
        strum_y is not None and
        prev_strum_y is not None and
        strum_x is not None and
        start_x <= strum_x <= end_x and
        current_chord and current_mode
    ):
        for i in range(num_strings):
            y = start_y + i * spacing
            if (prev_strum_y < y <= strum_y) or (prev_strum_y > y >= strum_y):
                string_colors[i] = (0, 0, 255) if current_mode == "distorted" else (0, 165, 255)
                string_hit_time[i] = frame_count
                if string_sounds[i]:
                    ch = string_channels[i]
                    ch.stop()
                    ch.play(string_sounds[i])

    prev_strum_y = strum_y

    # 🎨 Draw strings
    for i in range(num_strings):
        if frame_count - string_hit_time[i] > color_duration:
            string_colors[i] = (200, 200, 200)
        y = start_y + i * spacing
        cv2.line(frame, (start_x, y), (end_x, y), string_colors[i], 2)
        cv2.putText(frame, string_labels[i], (start_x - 30, y + 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

    frame[:, :w // 2] = left_frame
    cv2.imshow('MediaPipe Pose + Hands', frame)
    frame_count += 1

    if cv2.waitKey(5) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()