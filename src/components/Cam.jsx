import React, { useEffect, useRef } from "react";
import { Pose } from "@mediapipe/pose";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";

export default function StrumHand() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const pickImage = new Image();
  pickImage.src = "aerostrum-browser/images/pick.webp"; 

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // === Pose ===
    const pose = new Pose({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    // === Hands ===
    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    // === Load chord sounds ===
    const chordFolder = "chords"; // place chords folder inside public/
    let currentChord = null;
    let currentMode = null;
    const numStrings = 6;
    let stringSounds = Array(numStrings).fill(null);
    
    const activeAudio = Array(numStrings).fill(null);

    async function loadChordSounds(chordName, mode = "acoustic") {
      stringSounds = [];
      for (let i = 0; i < numStrings; i++) {
        // const path = `/${chordFolder}/${mode}/${chordName}/string${i + 1}.wav`;
        const path = `/aerostrum-browser/${chordFolder}/${mode}/${chordName}/string${i + 1}.wav`;
        stringSounds.push(new Audio(path));
      }
      currentChord = chordName;
      currentMode = mode;
    }

    // === Detect chord gesture ===
    function detectHandGesture(handLandmarks) {
      const thumbTip = handLandmarks[4];
      const thumbIp = handLandmarks[3];
      const thumbMcp = handLandmarks[2];
      const tips = [8, 12, 16, 20];
      const pips = [6, 10, 14, 18];
      const thumbOpen = thumbTip.x > thumbIp.x && thumbIp.x > thumbMcp.x;
      const yTips = tips.map((i) => handLandmarks[i].y);
      const yPips = pips.map((i) => handLandmarks[i].y);
      const fingersUp = yTips.map((y, i) => y < yPips[i]);
      const pattern = [thumbOpen, ...fingersUp];

      const acousticPatterns = {
        "false,true,false,false,false": ["C", "acoustic"],
        "false,true,true,false,false": ["Dm", "acoustic"],
        "false,true,true,true,false": ["Em", "acoustic"],
        "false,true,true,true,true": ["F", "acoustic"],
        "false,false,false,false,true": ["G", "acoustic"],
        "false,false,false,true,true": ["Am", "acoustic"],
        "false,false,true,true,true": ["Bdim", "acoustic"],
      };
      const distortedPatterns = {
        "true,true,false,false,false": ["C", "distorted"],
        "true,true,true,false,false": ["Dm", "distorted"],
        "true,true,true,true,false": ["Em", "distorted"],
        "true,true,true,true,true": ["F", "distorted"],
        "true,false,false,false,true": ["G", "distorted"],
        "true,false,false,true,true": ["Am", "distorted"],
        "true,false,true,true,true": ["Bdim", "distorted"],
      };
      const key = pattern.join(",");
      if (key in acousticPatterns) return acousticPatterns[key];
      if (key in distortedPatterns) return distortedPatterns[key];
      return [null, null];
    }

    // === State ===
    let latestPoseResults = null;
    let latestHandResults = null;
    const spacing = 20;
    const stringLabels = ["E", "A", "D", "G", "B", "E"];
    const stringColors = Array(numStrings).fill([200, 200, 200]);
    const stringHitTime = Array(numStrings).fill(0);
    const colorDuration = 10;
    let prevStrumY = null;
    let frameCount = 0;

    // === Draw function ===
    const drawCombined = (poseResults, handResults) => {
      if (!poseResults && !handResults) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const image = poseResults?.image || handResults?.image;
      if (image) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }

      // Draw strings
      const offsetX = 80;
      const offsetY = 80;
      const startX = canvas.width / 2 - 100 + offsetX;
      const endX = canvas.width / 2 + 100 + offsetX;
      const startY = canvas.height / 2 - (numStrings / 2) * spacing + offsetY;
      for (let i = 0; i < numStrings; i++) {
        const y = startY + i * spacing;
        if (frameCount - stringHitTime[i] > colorDuration) {
          stringColors[i] = [200, 200, 200];
        }
        const [r, g, b] = stringColors[i];
        ctx.strokeStyle = `rgb(${r},${g},${b})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
        ctx.fillStyle = "white";
        ctx.font = "16px Arial";
        ctx.fillText(stringLabels[i], startX - 30, y + 5);
      }

      const stringTopY = startY; 
      const stringBottomY = startY + (numStrings - 1) * spacing;
      const stringLeftX = startX;
      const stringRightX = endX;

      // Pose right wrist
      if (poseResults?.poseLandmarks) {
        const wrist = poseResults.poseLandmarks[20];
        const wristX = (1 - wrist.x) * canvas.width;
        const wristY = wrist.y * canvas.height;
        // ctx.fillStyle = "red";
        // ctx.beginPath();
        // ctx.arc(wristX, wristY, 10, 0, 2 * Math.PI);
        // ctx.fill();

        if (pickImage) {
          const pickSize = 50;
          ctx.save();
          ctx.translate(wristX, wristY);
          ctx.rotate(Math.PI / 8); // slight tilt for realism
          ctx.drawImage(
            pickImage,
            -pickSize / 2,
            -pickSize / 2,
            pickSize,
            pickSize
          );
          ctx.restore();
        }

        if (
          wristX >= stringLeftX &&
          wristX <= stringRightX &&
          wristY >= stringTopY &&
          wristY <= stringBottomY
        ) {
          // Only now check if strum passes each string
          for (let i = 0; i < numStrings; i++) {
            const y = startY + i * spacing;
            if ((prevStrumY < y && wristY >= y) || (prevStrumY > y && wristY <= y)) {
              stringColors[i] = currentMode === "distorted" ? [255, 0, 0] : [0, 165, 255];
              stringHitTime[i] = frameCount;

              if (activeAudio[i]) {
                activeAudio[i].pause();
                activeAudio[i].currentTime = 0;
              }

              // PLAY new audio and save reference
              activeAudio[i] = stringSounds[i];
              activeAudio[i].currentTime = 0;
              activeAudio[i].play();
            }
          }
        }
        prevStrumY = wristY;
      }

      // Hand landmarks + gesture
      if (handResults?.multiHandLandmarks) {
        handResults.multiHandLandmarks.forEach((hand) => {
          // Draw landmarks
          ctx.fillStyle = "orange";
          hand.forEach((lm) => {
            const x = (1 - lm.x) * canvas.width;
            const y = lm.y * canvas.height;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fill();
          });

          // Detect chord
          const [gestureChord, gestureMode] = detectHandGesture(hand);
          if (gestureChord && gestureMode && (gestureChord !== currentChord || gestureMode !== currentMode)) {
            loadChordSounds(gestureChord, gestureMode);
          }
          if (gestureChord && gestureMode) {
            ctx.fillStyle = "lime";
            ctx.font = "20px Arial";
            ctx.fillText(`${gestureChord} (${gestureMode})`, 10, 30);
          }
        });
      }

      frameCount++;
    };

    pose.onResults((res) => {
      latestPoseResults = res;
      drawCombined(latestPoseResults, latestHandResults);
    });
    hands.onResults((res) => {
      latestHandResults = res;
      drawCombined(latestPoseResults, latestHandResults);
    });

    // === Camera ===
    const camera = new Camera(video, {
      onFrame: async () => {
        await pose.send({ image: video });
        await hands.send({ image: video });
      },
      width: 640,
      height: 480,
    });
    camera.start();

    return () => camera.stop();
  }, []);

  return (
    <div style={{ textAlign: "center" }}>
      <video ref={videoRef} style={{ display: "none" }} />
      <canvas ref={canvasRef} width={640} height={480} style={{ border: "2px solid white" }} />
    </div>
  );
}
