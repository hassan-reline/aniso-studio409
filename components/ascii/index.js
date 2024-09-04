import { OrbitControls, useAspect, useContextBridge } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from '@react-three/postprocessing';
import cn from 'clsx';
import { ASCIIEffect } from 'components/ascii-effect/index';
import { FontEditor } from 'components/font-editor';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimationMixer,
  Group,
  MeshBasicMaterial,
  MeshNormalMaterial,
  TextureLoader,
  VideoTexture
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import tunnel from 'tunnel-rat';
import s from './ascii.module.scss';
import { AsciiContext } from './context';

const ui = tunnel();

function Scene() {
  const ref = useRef();
  const { fit } = useContext(AsciiContext);
  const [asset, setAsset] = useState('public/reline-3d.glb');
  const { viewport, camera } = useThree();

  // Adjust the position by 33.33% of the viewport height
  const offsetY = -0.3333 * viewport.height;

  const gltfLoader = useMemo(() => {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      'https://cdn.jsdelivr.net/npm/three@0.140.0/examples/js/libs/draco/'
    );
    loader.setDRACOLoader(dracoLoader);
    return loader;
  }, []);

  const [mixer, setMixer] = useState();

  useFrame((_, t) => {
    mixer?.update(t);
  });

  const gltf = useMemo(() => {
    if (!asset) return;
    let src = asset;

    if (src.startsWith('data:application/octet-stream;base64') || src.includes('.glb')) {
      const group = new Group();

      gltfLoader.load(src, ({ scene, animations }) => {
        const mixer = new AnimationMixer(scene);
        setMixer(mixer);
        const clips = animations;

        clips.forEach((clip) => {
          mixer.clipAction(clip).play();
        });

        group.add(scene);
        scene.traverse((mesh) => {
          if (
            Object.keys(mesh.userData)
              .map((v) => v.toLowerCase())
              .includes('occlude')
          ) {
            mesh.material = new MeshBasicMaterial({ color: '#000000' });
          } else {
            mesh.material = new MeshNormalMaterial();
          }
        });
      });

      return group;
    }
  }, [asset]);

  const [texture, setTexture] = useState();

  useEffect(() => {
    if (gltf) setTexture(null);
  }, [gltf]);

  useEffect(() => {
    let src = asset;

    if (
      src.startsWith('data:video') ||
      src.includes('.mp4') ||
      src.includes('.webm') ||
      src.includes('.mov')
    ) {
      const video = document.createElement('video');

      function onLoad() {
        setTexture(new VideoTexture(video));
      }

      video.addEventListener('loadedmetadata', onLoad, { once: true });

      video.src = src;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      video.autoplay = true;
      video.play();
    } else if (
      src.startsWith('data:image') ||
      src.includes('.jpg') ||
      src.includes('.png') ||
      src.includes('.jpeg')
    ) {
      new TextureLoader().load(src, (texture) => {
        setTexture(texture);
      });
    } else if (src.includes('.html')) {
      // Handle iframe embedding
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.style.border = 'none';
      iframe.style.position = 'absolute';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.top = '0';
      iframe.style.left = '0';

      const texture = new VideoTexture(iframe); // Create a texture from the iframe
      setTexture(texture);
    }
  }, [asset]);

  const dimensions = useMemo(() => {
    if (!texture) return;
    if (texture.isVideoTexture) {
      return [texture.image.videoWidth, texture.image.videoHeight];
    } else {
      return [texture.image.naturalWidth, texture.image.naturalHeight];
    }
  }, [texture]);

  const scale = useAspect(
    dimensions?.[0] || viewport.width, // Pixel-width
    dimensions?.[1] || viewport.height, // Pixel-height
    1 // Optional scaling factor
  );

  useEffect(() => {
    if (texture) {
      camera.position.set(0, 0, 5);
      camera.rotation.set(0, 0, 0);
      camera.zoom = 1;
    } else {
      camera.position.set(500, 250, 500);
    }
    camera.updateProjectionMatrix();
  }, [camera, texture]);

  return (
    <>
      <group ref={ref}>
        {gltf && (
          <group>
            <OrbitControls
              makeDefault
              enableZoom={false}
              enablePan={false}
              maxPolarAngle={Math.PI / 2}
              minPolarAngle={Math.PI / 2}
              autoRotate={true}
              autoRotateSpeed={5}
            />
            <group>
              <group position={[0, offsetY, 0]} scale={200}>
                <primitive object={gltf} />
              </group>
            </group>
          </group>
        )}

        {texture && (
          <mesh scale={fit ? scale : [viewport.width, viewport.height, 1]}>
            <planeBufferGeometry />
            <meshBasicMaterial map={texture} />
          </mesh>
        )}
      </group>
    </>
  );
}

function Postprocessing() {
  const { gl, viewport } = useThree();
  const { set } = useContext(AsciiContext);

  useEffect(() => {
    set({ canvas: gl.domElement });
  }, [gl]);

  const {
    charactersTexture,
    granularity,
    charactersLimit,
    fillPixels,
    color,
    greyscale,
    invert,
    matrix,
    time,
    background,
    fit,
  } = useContext(AsciiContext);

  console.log('Postprocessing: fit value is', fit);

  return (
    <EffectComposer>
      <ASCIIEffect
        charactersTexture={charactersTexture}
        granularity={granularity * viewport.dpr}
        charactersLimit={charactersLimit}
        fillPixels={fillPixels}
        color={color}
        fit={fit}
        greyscale={greyscale}
        invert={invert}
        matrix={matrix}
        time={time}
        background={background}
      />
    </EffectComposer>
  );
}

function Inner() {
  const ContextBridge = useContextBridge(AsciiContext);

  return (
    <>
      <div className={s.ascii}>
        <div className={cn(s.canvas)}>
          <Canvas
            flat
            linear
            orthographic
            camera={{ position: [0, 0, 500], near: 0.1, far: 10000 }}
            resize={{ debounce: 100 }}
            gl={{
              antialias: false,
              alpha: true,
              depth: false,
              stencil: false,
              powerPreference: 'high-performance',
            }}
          >
            <ContextBridge>
              <Scene />
              <Postprocessing />
            </ContextBridge>
          </Canvas>
        </div>
      </div>
      <FontEditor />
      <ui.Out />
    </>
  );
}

const DEFAULT = {
  characters: ' *,    ./O#RL',
  granularity: 8,
  charactersLimit: 16,
  fontSize: 72,
  fillPixels: false,
  setColor: true,
  color: '#ffffff',
  background: '#cd9bff',
  greyscale: false,
  invert: false,
  matrix: false,
  setTime: false,
  time: 0,
  fit: true, // Ensure fit is part of the context
};

export function ASCII({ children }) {
  const [charactersTexture, setCharactersTexture] = useState(null);
  const [canvas, setCanvas] = useState();
  const [matrix, setMatrix] = useState(DEFAULT.matrix);

  const {
    characters,
    granularity,
    charactersLimit,
    fontSize,
    fillPixels,
    setColor,
    color,
    fit,
    greyscale,
    invert,
    matrix: contextMatrix,
    setTime,
    time,
    background,
  } = DEFAULT;

  useEffect(() => {
    function handleKeyPress(event) {
      if (event.shiftKey && event.key === 'R') {
        setMatrix((prevMatrix) => !prevMatrix);
      }
    }

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    }
  }, []);

  function set(newSettings) {
    if (newSettings.charactersTexture) setCharactersTexture(newSettings.charactersTexture);
    if (newSettings.canvas) setCanvas(newSettings.canvas);
    if (newSettings.matrix !== undefined) setMatrix(newSettings.matrix);
    console.log('Settings updated:', newSettings);
  }

  return (
    <AsciiContext.Provider
      value={{
        characters: characters.toUpperCase(),
        granularity,
        charactersTexture,
        charactersLimit,
        fontSize,
        fillPixels,
        color: setColor ? color : undefined,
        fit,
        greyscale,
        invert,
        matrix,
        time: setTime ? time : undefined,
        background,
        set,
      }}
    >
      <Inner />
    </AsciiContext.Provider>
  );
}