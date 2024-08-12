import { OrbitControls, useAspect, useContextBridge } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import cn from 'clsx'
import { ASCIIEffect } from 'components/ascii-effect/index'
import { FontEditor } from 'components/font-editor'
import { GUI } from 'components/gui'
import { button, useControls } from 'leva'
import { text } from 'lib/leva/text'
import { useStore } from 'lib/store'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  AnimationMixer,
  Group,
  MeshBasicMaterial,
  MeshNormalMaterial,
  TextureLoader,
  VideoTexture,
} from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import tunnel from 'tunnel-rat'
import s from './ascii.module.scss'
import { AsciiContext } from './context'

const ui = tunnel()

function Scene() {
  const ref = useRef()

  const [asset, setAsset] = useState('/global.glb')

  const gltfLoader = useMemo(() => {
    const loader = new GLTFLoader()

    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(
      'https://cdn.jsdelivr.net/npm/three@0.140.0/examples/js/libs/draco/'
    )
    loader.setDRACOLoader(dracoLoader)

    return loader
  }, [])

  const [mixer, setMixer] = useState()

  useFrame((_, t) => {
    mixer?.update(t)
  })

  const gltf = useMemo(() => {
    if (!asset) return
    let src = asset

    if (
      src.startsWith('data:application/octet-stream;base64') ||
      src.includes('.glb')
    ) {
      const group = new Group()

      gltfLoader.load(src, ({ scene, animations }) => {
        const mixer = new AnimationMixer(scene)
        setMixer(mixer)
        const clips = animations

        clips.forEach((clip) => {
          mixer.clipAction(clip).play()
        })

        group.add(scene)
        scene.traverse((mesh) => {
          if (
            Object.keys(mesh.userData)
              .map((v) => v.toLowerCase())
              .includes('occlude')
          ) {
            mesh.material = new MeshBasicMaterial({ color: '#000000' })
          } else {
            mesh.material = new MeshNormalMaterial()
          }
        })
      })

      return group
    }
  }, [asset])

  const [texture, setTexture] = useState()

  useEffect(() => {
    if (gltf) setTexture(null)
  }, [gltf])

  useEffect(() => {
    let src = asset

    if (
      src.startsWith('data:video') ||
      src.includes('.mp4') ||
      src.includes('.webm') ||
      src.includes('.mov')
    ) {
      const video = document.createElement('video')

      function onLoad() {
        setTexture(new VideoTexture(video))
      }

      video.addEventListener('loadedmetadata', onLoad, { once: true })

      video.src = src
      video.crossOrigin = 'anonymous'
      video.muted = true
      video.playsInline = true
      video.loop = true
      video.autoplay = true
      video.play()
    } else if (
      src.startsWith('data:image') ||
      src.includes('.jpg') ||
      src.includes('.png') ||
      src.includes('.jpeg')
    ) {
      new TextureLoader().load(src, (texture) => {
        setTexture(texture)
      })
    }
  }, [asset])

  const { viewport, camera } = useThree()

  const dimensions = useMemo(() => {
    if (!texture) return
    if (texture.isVideoTexture) {
      return [texture.image.videoWidth, texture.image.videoHeight]
    } else {
      return [texture.image.naturalWidth, texture.image.naturalHeight]
    }
  }, [texture])

  const scale = useAspect(
    dimensions?.[0] || viewport.width, // Pixel-width
    dimensions?.[1] || viewport.height, // Pixel-height
    1 // Optional scaling factor
  )

  const { fit } = useContext(AsciiContext)

  useEffect(() => {
    if (texture) {
      camera.position.set(0, 0, 5)
      camera.rotation.set(0, 0, 0)
      camera.zoom = 1
    } else {
      camera.position.set(500, 250, 500)
    }

    camera.updateProjectionMatrix()
  }, [camera, texture])

  return (
    <>
      <group ref={ref}>
        {gltf && (
          <>
            <OrbitControls makeDefault />
            <group scale={200}>
              <primitive object={gltf} />
            </group>
          </>
        )}

        {texture && (
          <mesh scale={fit ? scale : [viewport.width, viewport.height, 1]}>
            <planeBufferGeometry />
            <meshBasicMaterial map={texture} />
          </mesh>
        )}
      </group>
    </>
  )
}

function Postprocessing() {
  const { gl, viewport } = useThree()
  const { set } = useContext(AsciiContext)

  useEffect(() => {
    set({ canvas: gl.domElement })
  }, [gl])

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
  } = useContext(AsciiContext)

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
  )
}

function Inner() {
  const ContextBridge = useContextBridge(AsciiContext)

  const gui = useStore(({ gui }) => gui)

  return (
    <>
      <div className={s.ascii}>
        <GUI />
        <div className={cn(s.canvas, gui && s.open)}>
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
  )
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
  fit: true,
}

export function ASCII({ children }) {
  const initialUrlParams = useMemo(
    () => new URLSearchParams(window.location.search),
    []
  )

  const [charactersTexture, setCharactersTexture] = useState(null)
  const [canvas, setCanvas] = useState()

  const [
    {
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
      matrix,
      setTime,
      time,
      background,
    },
    _set,
  ] = useControls(
    () => ({
      characters: text(
        initialUrlParams.get('characters') || DEFAULT.characters
      ),
      granularity: {
        min: 4,
        max: 32,
        value: initialUrlParams.get('granularity') || DEFAULT.granularity,
        step: 1,
        label: 'granularity',
      },
      charactersLimit: {
        min: 1,
        max: 48,
        value:
          initialUrlParams.get('charactersLimit') || DEFAULT.charactersLimit,
        step: 1,
        label: 'charLimit',
      },
      fontSize: {
        min: 1,
        max: 128,
        value: initialUrlParams.get('fontSize') || DEFAULT.fontSize,
        step: 1,
        label: 'font size',
      },
      greyscale: {
        value:
          initialUrlParams.get('greyscale') === 'true' || DEFAULT.greyscale,
      },
      invert: {
        value: initialUrlParams.get('invert') === 'true' || DEFAULT.invert,
      },
      fillPixels: {
        value:
          initialUrlParams.get('fillPixels') === 'true' || DEFAULT.fillPixels,
        label: 'fill pixels',
      },
      fit: {
        value: initialUrlParams.get('fit') || DEFAULT.fit,
      },
      matrix: {
        value: initialUrlParams.get('matrix') === 'true' || DEFAULT.matrix,
      },
      setTime: {
        value: !!initialUrlParams.get('time') || DEFAULT.setTime,
        label: 'set time',
        render: (get) => get('matrix') === true,
      },
      time: {
        min: 0,
        value: parseFloat(initialUrlParams.get('time')) || DEFAULT.time,
        max: 1,
        step: 0.01,
        render: (get) => get('setTime') === true,
      },
      setColor: {
        value: !!initialUrlParams.get('color') || DEFAULT.setColor,
        label: 'set color',
      },
      color: {
        value: initialUrlParams.get('color')
          ? '#' + initialUrlParams.get('color')
          : DEFAULT.color,
        label: 'color',
        render: (get) => get('setColor') === true,
      },
      background: {
        value: initialUrlParams.get('background')
          ? '#' + initialUrlParams.get('background')
          : DEFAULT.background,
        label: 'background',
      },
    }),
    []
  )

  useControls(
    () => ({
      export: button(() => {
        let a = document.createElement('a')
        a.download = 'ASCII'

        requestAnimationFrame(() => {
          a.href = canvas.toDataURL('image/png;base64')
          a.click()
        })
      }),
      reset: button(() => {
        _set(DEFAULT)
      }),
    }),
    [canvas]
  )

  const UrlParams = useMemo(() => {
    const params = new URLSearchParams()
    params.set('characters', characters)
    params.set('granularity', granularity)
    params.set('charactersLimit', charactersLimit)
    params.set('fontSize', fontSize)
    params.set('matrix', matrix === true)
    params.set('invert', invert === true)
    params.set('greyscale', greyscale === true)
    params.set('fillPixels', fillPixels === true)
    if (setTime) {
      params.set('time', time)
    } else {
      params.delete('time')
    }

    if (setColor) {
      params.set('color', color.replace('#', ''))
    } else {
      params.delete('color')
    }

    params.set('background', background.replace('#', ''))
    return params
  }, [
    characters,
    granularity,
    fontSize,
    fillPixels,
    setColor,
    color,
    invert,
    greyscale,
    matrix,
    setTime,
    time,
    background,
  ])

  useEffect(() => {
    const url = window.origin + '?' + UrlParams.toString()
    window.history.replaceState({}, null, url)
  }, [UrlParams])

  function set({ charactersTexture, canvas, ...props }) {
    if (charactersTexture) setCharactersTexture(charactersTexture)
    if (canvas) setCanvas(canvas)
    _set(props)
  }

  return (
    <>
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
    </>
  )
}
