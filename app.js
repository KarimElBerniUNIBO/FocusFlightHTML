// --- CONFIGURAZIONE ---
const BOLOGNA = { name: "Bologna", lat: 44.4949, lon: 11.3426 }; // HUB

const CITIES = [
    { name: "Roma", lat: 41.9028, lon: 12.4964 },
    { name: "New York", lat: 40.7128, lon: -74.0060 },
    { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
    { name: "Londra", lat: 51.5074, lon: -0.1278 },
    { name: "Sydney", lat: -33.8688, lon: 151.2093 },
    { name: "Rio de Janeiro", lat: -22.9068, lon: -43.1729 },
    { name: "Cape Town", lat: -33.9249, lon: 18.4241 },
    { name: "Dubai", lat: 25.2048, lon: 55.2708 },
    { name: "Singapore", lat: 1.3521, lon: 103.8198 },
    { name: "San Francisco", lat: 37.7749, lon: -122.4194 },
    { name: "Mosca", lat: 55.7558, lon: 37.6173 },
    { name: "Reykjavik", lat: 64.1265, lon: -21.8174 }
];

// --- VARIABILI GLOBALI ---
let scene, camera, renderer, controls, globe;
let raycaster, mouse;
let markers = [];       
let citySprites = [];   
let bolognaMarker = null; 
let animationId;
let audioContext, noiseNode;

// Variabili Volo
let planeGroup = null; // Contenitore per orientare l'aereo
let activeFlightPlane = null; // La mesh vera e propria
let activeFlightPathLine = null;
let planeLight = null;
let is3DModel = false;
let flightStartTime = 0;
let flightDurationMs = 0;
let isFlying = false;
let prevPlanePos = new THREE.Vector3(); // Per calcolare il delta movimento

let timerInterval, remainingSeconds, totalSeconds;
let calculatedDurationMinutes = 0; 

// --- INIZIALIZZAZIONE ---
document.addEventListener('DOMContentLoaded', () => {
    initThreeJS();
    loadStats();
    setupEventListeners();
});

// --- THREE.JS SETUP ---
function initThreeJS() {
    const container = document.getElementById('globe-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02040a); 

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 18; 
    camera.position.y = 5;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // 4. Globo
    const globeGeometry = new THREE.SphereGeometry(5, 128, 128);
    const textureLoader = new THREE.TextureLoader();
    
    textureLoader.load('assets/earth.jpg', (texture) => {
        const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.anisotropy = maxAnisotropy; 
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.encoding = THREE.sRGBEncoding;
        globeMaterial.map = texture;
        globeMaterial.needsUpdate = true;
        globeMaterial.color.setHex(0xffffff);
    });

    const globeMaterial = new THREE.MeshPhongMaterial({
        color: 0x1e3a8a, 
        bumpScale: 0.05,
        specular: new THREE.Color(0x333333),
        shininess: 5
    });

    globe = new THREE.Mesh(globeGeometry, globeMaterial);
    scene.add(globe);

    // 5. Atmosfera
    const atmoGeo = new THREE.SphereGeometry(5.1, 64, 64);
    const atmoMat = new THREE.MeshLambertMaterial({
        color: 0x3b82f6, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, side: THREE.BackSide
    });
    const atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
    scene.add(atmosphere);

    // 6. Luci
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xffffff, 1.5);
    pointLight.position.set(20, 10, 20);
    scene.add(pointLight);

    // 7. Elementi
    addStars();
    addCityMarkers(); 
    addBolognaMarker(); 

    // 8. Controlli
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.6;
    controls.enableZoom = true; 
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.2;
    controls.minDistance = 5.1; 
    controls.maxDistance = 30;

    // 9. Raycaster
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Eventi
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', onGlobeClick);

    animate();
}

// --- MATEMATICA GEOGRAFICA ---

function latLongToVector3(lat, lon, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = (radius * Math.sin(phi) * Math.sin(theta));
    const y = (radius * Math.cos(phi));
    return new THREE.Vector3(x, y, z);
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; 
    var dLat = deg2rad(lat2-lat1);  
    var dLon = deg2rad(lon2-lon1); 
    var a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    var d = R * c; 
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

// --- MARKERS ---

function addBolognaMarker() {
    const pos = latLongToVector3(BOLOGNA.lat, BOLOGNA.lon, 5.3);
    const geo = new THREE.SphereGeometry(0.15, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 }); 
    bolognaMarker = new THREE.Mesh(geo, mat); 
    bolognaMarker.position.copy(pos);
    globe.add(bolognaMarker);
}

function addCityMarkers() {
    const textureLoader = new THREE.TextureLoader();
    const planeTex = textureLoader.load('assets/plane.webp');
    
    const spriteMaterial = new THREE.SpriteMaterial({ 
        map: planeTex, 
        color: 0xffaaaa, 
        transparent: true,
    });

    const hitGeo = new THREE.SphereGeometry(0.6, 16, 16); 
    const hitMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, visible: false }); 

    CITIES.forEach(city => {
        const pos = latLongToVector3(city.lat, city.lon, 5.3); 
        
        const sprite = new THREE.Sprite(spriteMaterial.clone());
        sprite.position.copy(pos);
        sprite.scale.set(0.5, 0.5, 0.5); 
        
        const hitMesh = new THREE.Mesh(hitGeo, hitMat.clone());
        hitMesh.position.copy(pos);
        hitMesh.userData = { isCity: true, name: city.name, lat: city.lat, lon: city.lon };

        globe.add(sprite); 
        citySprites.push(sprite); 
        
        globe.add(hitMesh); 
        markers.push(hitMesh); 
    });
}

function toggleMarkers(visible) {
    citySprites.forEach(sprite => {
        sprite.visible = visible;
    });
    if (bolognaMarker) {
        bolognaMarker.visible = visible;
    }
}

function addStars() {
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1500;
    const posArray = new Float32Array(starCount * 3);
    for(let i=0; i<starCount*3; i++) {
        posArray[i] = (Math.random() - 0.5) * 120;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const starMat = new THREE.PointsMaterial({size: 0.15, color: 0xffffff, transparent: true, opacity: 0.8});
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
}

// --- INTERAZIONE ---

function onGlobeClick(event) {
    if (isFlying) return; 

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(markers);

    if (intersects.length > 0) {
        controls.autoRotate = false;
        const data = intersects[0].object.userData;
        openBookingModal(data.name, data.lat, data.lon);
    }
}

function onMouseMove(event) {
    if (isFlying) return; 

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(markers);
    const label = document.getElementById('cityLabel');
    const container = document.getElementById('globe-container');

    if (intersects.length > 0) {
        container.style.cursor = 'pointer';
        controls.autoRotate = false;
        label.style.display = 'block';
        label.style.left = event.clientX + 'px';
        label.style.top = event.clientY + 'px';
        label.innerText = intersects[0].object.userData.name;
    } else {
        container.style.cursor = 'grab';
        controls.autoRotate = true;
        label.style.display = 'none';
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    animationId = requestAnimationFrame(animate);
    controls.update();

    // --- LOGICA ANIMAZIONE VOLO ---
    if (isFlying && planeGroup && flightCurve) {
        const now = Date.now();
        const elapsed = now - flightStartTime;
        const progress = Math.min(elapsed / flightDurationMs, 1.0); 

        // 1. Calcola nuova posizione sulla curva
        const newPoint = flightCurve.getPointAt(progress);
        
        // 2. CAMERA FOLLOW (Sposta la camera fisicamente col delta)
        // Questo permette all'utente di ruotare (orbitare) liberamente attorno al punto in cui si trova l'aereo
        const delta = newPoint.clone().sub(prevPlanePos);
        camera.position.add(delta);
        
        // Aggiorniamo il centro di rotazione sull'aereo per un'orbita corretta
        controls.target.copy(newPoint);

        // 3. Aggiorna posizione Aereo
        planeGroup.position.copy(newPoint);
        prevPlanePos.copy(newPoint);

        // 4. Aggiorna Luce
        if(planeLight) {
            planeLight.position.copy(newPoint).add(new THREE.Vector3(0, 2, 0));
        }

        // 5. Orientamento Aereo
        if(is3DModel) {
            const tangent = flightCurve.getTangentAt(progress).normalize();
            const lookAtPoint = newPoint.clone().add(tangent);
            planeGroup.lookAt(lookAtPoint);
        }
    }

    renderer.render(scene, camera);
}

// --- FUNZIONE UTILITY: Normalizza scala ---
function normalizeModelScale(model, targetSize) {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return; 
    const scaleFactor = targetSize / maxDim;
    model.scale.set(scaleFactor, scaleFactor, scaleFactor);
}

// --- UI & LOGICA DI GIOCO ---

let selectedCityData = {};

function setupEventListeners() {
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('takeoffBtn').addEventListener('click', startFlight);
    document.getElementById('abortBtn').addEventListener('click', () => landPlane(false));
    document.getElementById('returnBtn').addEventListener('click', resetToGlobe);
}

function openBookingModal(cityName, lat, lon) {
    document.getElementById('selectedCityName').innerText = cityName;
    selectedCityData = { lat: lat, lon: lon }; 

    const km = getDistanceFromLatLonInKm(BOLOGNA.lat, BOLOGNA.lon, lat, lon);
    const speedFactor = 180; 
    const baseTime = 10;
    calculatedDurationMinutes = Math.floor(baseTime + (km / speedFactor));

    document.getElementById('calculatedDurationDisplay').innerText = `${calculatedDurationMinutes} min`;
    document.getElementById('distanceDisplay').innerText = `${Math.floor(km)} km`;

    document.getElementById('flightConfigModal').classList.remove('hidden-screen');
    setTimeout(() => document.getElementById('taskInput').focus(), 100);
}

function closeModal() {
    document.getElementById('flightConfigModal').classList.add('hidden-screen');
}

// --- AVVIO VOLO ---
let flightCurve = null;

function startFlight() {
    const destinationName = document.getElementById('selectedCityName').innerText;
    const task = document.getElementById('taskInput').value || "Focus Session";
    const durationMins = calculatedDurationMinutes; 
    const soundOn = document.getElementById('soundToggle').checked;

    closeModal();
    toggleMarkers(false);
    
    const flightModeDiv = document.getElementById('flightMode');
    flightModeDiv.classList.remove('hidden-screen');
    flightModeDiv.classList.add('flex-screen');
    flightModeDiv.classList.remove('bg-slate-900'); 
    flightModeDiv.style.pointerEvents = "none"; 
    document.getElementById('abortBtn').style.pointerEvents = "auto";

    document.getElementById('flightDestDisplay').innerText = `${destinationName} (${task})`;

    const now = new Date();
    const arrivalTime = new Date(now.getTime() + durationMins * 60000);
    document.getElementById('arrivalTimeDisplay').innerText = 
        `${arrivalTime.getHours().toString().padStart(2,'0')}:${arrivalTime.getMinutes().toString().padStart(2,'0')}`;

    // --- 3D ANIMATION SETUP ---
    isFlying = true;
    
    // CONTROLLI: Rotazione LIBERA attorno all'aereo
    controls.enableRotate = true; 
    controls.enableZoom = true; 
    controls.enablePan = false; 

    flightDurationMs = durationMins * 60 * 1000; 
    flightStartTime = Date.now();

    const startVec = latLongToVector3(BOLOGNA.lat, BOLOGNA.lon, 5.2);
    const endVec = latLongToVector3(selectedCityData.lat, selectedCityData.lon, 5.2);
    // TRAIETTORIA TESA (5.8)
    const midVec = startVec.clone().add(endVec).normalize().multiplyScalar(5.8); 
    
    flightCurve = new THREE.QuadraticBezierCurve3(startVec, midVec, endVec);
    prevPlanePos.copy(startVec);

    // POSIZIONAMENTO CAMERA INIZIALE (Chase View)
    // Posizioniamo la camera "sopra e indietro" rispetto alla direzione iniziale
    const tangentStart = flightCurve.getTangentAt(0).normalize();
    const upStart = startVec.clone().normalize();
    const backStart = tangentStart.clone().negate();
    
    // Impostiamo lo zoom iniziale molto vicino (Chase Cam)
    const camStartPos = startVec.clone()
        .add(upStart.multiplyScalar(2.0)) // Altezza sopra aereo
        .add(backStart.multiplyScalar(3.0)); // Distanza dietro aereo
        
    camera.position.copy(camStartPos);
    controls.target.copy(startVec); // Guarda l'aereo

    // Linea Rotta
    const points = flightCurve.getPoints(50);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x3b82f6, linewidth: 2 });
    activeFlightPathLine = new THREE.Line(geometry, material);
    scene.add(activeFlightPathLine);

    // --- CONTAINER AEREO ---
    planeGroup = new THREE.Group();
    planeGroup.position.copy(startVec);
    scene.add(planeGroup);

    // CARICAMENTO
    const gltfLoader = new THREE.GLTFLoader();
    
    gltfLoader.load(
        'assets/plane.glb', 
        function (gltf) {
            activeFlightPlane = gltf.scene;
            
            // SCALA RIDOTTA
            normalizeModelScale(activeFlightPlane, 0.12);
            // FIX ALLINEAMENTO: La posizione del modello nel gruppo deve essere 0,0,0
            activeFlightPlane.position.set(0, 0, 0);
            // FIX DIREZIONE
            activeFlightPlane.rotation.y = Math.PI;

            planeGroup.add(activeFlightPlane);
            is3DModel = true; 
            
            // Luce dedicata
            planeLight = new THREE.PointLight(0xffffff, 2, 10);
            scene.add(planeLight);
            
            console.log("Modello 3D caricato!");
        },
        undefined,
        function (error) {
            // Fallback 2D
            console.warn("plane.glb non trovato, uso sprite 2D.");
            is3DModel = false;
            const textureLoader = new THREE.TextureLoader();
            const planeTex = textureLoader.load('assets/plane_flying.webp');
            const planeMat = new THREE.SpriteMaterial({ map: planeTex, color: 0xffffff, depthTest: false });
            activeFlightPlane = new THREE.Sprite(planeMat);
            activeFlightPlane.renderOrder = 999; 
            activeFlightPlane.scale.set(0.2, 0.2, 0.2); // Icona piccola
            activeFlightPlane.position.set(0, 0, 0);
            planeGroup.add(activeFlightPlane);
        }
    );

    // Timer
    totalSeconds = durationMins * 60;
    remainingSeconds = totalSeconds;
    updateTimerUI();
    
    if(soundOn) playEngineSound();

    timerInterval = setInterval(() => {
        remainingSeconds--;
        updateTimerUI();
        if(remainingSeconds <= 0) landPlane(true);
    }, 1000);
}

function updateTimerUI() {
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    document.getElementById('timerDisplay').innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    
    const pct = ((totalSeconds - remainingSeconds) / totalSeconds) * 100;
    document.getElementById('progressBar').style.width = `${pct}%`;
}

function landPlane(success) {
    clearInterval(timerInterval);
    stopEngineSound();
    isFlying = false;
    
    controls.enableRotate = true;
    controls.enableZoom = true;
    
    toggleMarkers(true);

    if (planeGroup) {
        scene.remove(planeGroup);
        planeGroup = null;
        activeFlightPlane = null;
    }
    if (activeFlightPathLine) {
        scene.remove(activeFlightPathLine);
        activeFlightPathLine = null;
    }
    if (planeLight) {
        scene.remove(planeLight);
        planeLight = null;
    }

    const flightModeDiv = document.getElementById('flightMode');
    flightModeDiv.classList.add('bg-slate-900'); 
    flightModeDiv.style.pointerEvents = "auto";

    if(success) {
        const distKm = getDistanceFromLatLonInKm(BOLOGNA.lat, BOLOGNA.lon, selectedCityData.lat, selectedCityData.lon);
        const milesEarned = Math.floor(distKm / 100) + 10; 
        saveMiles(milesEarned);
        
        flightModeDiv.classList.add('hidden-screen');
        flightModeDiv.classList.remove('flex-screen');
        
        const landed = document.getElementById('landedScreen');
        landed.classList.remove('hidden-screen');
        landed.classList.add('flex-screen');
        
        document.getElementById('arrivalCity').innerText = document.getElementById('selectedCityName').innerText;
        document.getElementById('earnedMiles').innerText = `+${milesEarned}`;
        playChime();
    } else {
        if(confirm("Vuoi davvero paracadutarti? Perderai i progressi.")) {
            resetToGlobe();
        } else {
            toggleMarkers(false);
            isFlying = true;
            const elapsedSecs = totalSeconds - remainingSeconds;
            flightStartTime = Date.now() - (elapsedSecs * 1000); 
            timerInterval = setInterval(() => {
                remainingSeconds--;
                updateTimerUI();
                if(remainingSeconds <= 0) landPlane(true);
            }, 1000);
            if(document.getElementById('soundToggle').checked) playEngineSound();
        }
    }
}

function resetToGlobe() {
    document.getElementById('landedScreen').classList.add('hidden-screen');
    document.getElementById('landedScreen').classList.remove('flex-screen');
    document.getElementById('flightMode').classList.add('hidden-screen');
    document.getElementById('flightMode').classList.remove('flex-screen');
    
    toggleMarkers(true);
    
    // RESET CAMERA COMPLETO (ZOOM OUT)
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.minDistance = 5.1;
    controls.maxDistance = 30;
    
    // Ripristina la vista globale
    camera.position.set(0, 5, 18);
    controls.target.set(0, 0, 0); // Importante: ruota attorno al centro terra

    if (planeGroup) scene.remove(planeGroup);
    if (activeFlightPathLine) scene.remove(activeFlightPathLine);
    if (planeLight) scene.remove(planeLight);
    isFlying = false;

    controls.autoRotate = true; 
    animate();
    loadStats();
}

// --- AUDIO & UTILS ---
function initAudio() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

function playEngineSound() {
    initAudio();
    if(audioContext.state === 'suspended') audioContext.resume();
    
    const bufferSize = 2 * audioContext.sampleRate;
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
    }
    noiseNode = audioContext.createBufferSource();
    noiseNode.buffer = noiseBuffer;
    noiseNode.loop = true;
    
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 350; 
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.2;

    noiseNode.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioContext.destination);
    noiseNode.start(0);
}

function stopEngineSound() {
    if(noiseNode) {
        noiseNode.stop();
        noiseNode.disconnect();
        noiseNode = null;
    }
}

function playChime() {
    initAudio();
    const o = audioContext.createOscillator();
    const g = audioContext.createGain();
    o.connect(g);
    g.connect(audioContext.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(523.25, audioContext.currentTime);
    o.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.1);
    g.gain.setValueAtTime(0.1, audioContext.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);
    o.start();
    o.stop(audioContext.currentTime + 1);
}

function loadStats() {
    const m = localStorage.getItem('ff_miles') || 0;
    document.getElementById('totalMilesDisplay').innerText = m;
}

function saveMiles(newMiles) {
    let m = parseInt(localStorage.getItem('ff_miles') || 0);
    localStorage.setItem('ff_miles', m + newMiles);
}