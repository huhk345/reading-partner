'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ComponentType, RefAttributes } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type {
  ForceGraphMethods,
  ForceGraphProps,
  LinkObject,
  NodeObject,
} from 'react-force-graph-3d';
import { api } from '../lib/api';
import { Check, Volume2, Sparkles, Target, History, RotateCw, BookOpen, Gamepad2, RefreshCw, Trophy, Play, LayoutGrid, Orbit } from 'lucide-react';
import { VocabReview, LevelConfig, GameSession, calcSoundThreshold, LevelStats, VocabGraphResponse, VocabGraphNode, VocabGraphLink } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import Title from './Title';
import WordMatchGame from './WordMatchGame';
import WordCompletionGame from './WordCompletionGame';

type ForceGraph3DComponent = ComponentType<
  ForceGraphProps<VocabGraphNode, VocabGraphLink> &
    RefAttributes<ForceGraphMethods<VocabGraphNode, VocabGraphLink>>
>;

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
}) as unknown as ForceGraph3DComponent;

// Cache cover textures across nodes/renders (client-only file)
const bookCoverTextureCache = new Map<string, THREE.Texture>();
const bookCoverTextureLoader = new THREE.TextureLoader();
// Ensure images can be used as WebGL textures without tainting the canvas.
// Requires the backend to return proper CORS headers for /uploads/*.
try {
  bookCoverTextureLoader.setCrossOrigin('anonymous');
} catch {
  // ignore if unsupported by the installed three.js version/types
}
// Render book covers in a separate layer so bloom doesn't affect them.
const BOOK_COVER_LAYER = 2;
// Render word labels in a separate overlay layer so bloom doesn't make them look "shiny".
const WORD_LABEL_LAYER = 3;
const NEBULA_CUBE_FACES = [
  '/textures/px.jpg',
  '/textures/nx.jpg',
  '/textures/py.jpg',
  '/textures/ny.jpg',
  '/textures/pz.jpg',
  '/textures/nz.jpg',
] as const;

const MATCH_GAME_LEVELS: LevelConfig[] = [
  { level: 1, difficulty: 'Easy',        timeLimit: 100, matchTarget: 15, mode: 'text' },
  { level: 2, difficulty: 'Medium-Easy', timeLimit: 100, matchTarget: 25, mode: 'mixed', soundThreshold: calcSoundThreshold(25) },
  { level: 3, difficulty: 'Medium',      timeLimit: 100, matchTarget: 35, mode: 'mixed', soundThreshold: calcSoundThreshold(35) },
  { level: 4, difficulty: 'Medium-Hard', timeLimit: 100, matchTarget: 45, mode: 'mixed', soundThreshold: calcSoundThreshold(45) },
  { level: 5, difficulty: 'Hard',        timeLimit: 100, matchTarget: 55, mode: 'mixed', soundThreshold: calcSoundThreshold(55) },
];

const COMPLETION_GAME_LEVELS: LevelConfig[] = [
  { level: 1, difficulty: 'Easy',        timeLimit: 60, matchTarget: 10,  mode: 'text' },
  { level: 2, difficulty: 'Medium-Easy', timeLimit: 60, matchTarget: 12,  mode: 'text' },
  { level: 3, difficulty: 'Medium',      timeLimit: 60, matchTarget: 15, mode: 'text' },
  { level: 4, difficulty: 'Medium-Hard', timeLimit: 60, matchTarget: 12, mode: 'mixed' }, // mixed here means sound mode level >= 4 in component
  { level: 5, difficulty: 'Hard',        timeLimit: 60, matchTarget: 15, mode: 'mixed' },
];

interface ReviewProps {
  onBack: () => void;
}

const ClayWordCard = ({ 
  review,
  index,
  onRefresh
}: { 
  review: VocabReview; 
  index: number;
  onRefresh?: (vocabId: number, data: { meaning?: string; phonetic?: string; audio_url?: string }) => void;
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isAutoFlipped, setIsAutoFlipped] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (!isFlipped) {
      hoverTimerRef.current = setTimeout(() => {
        setIsFlipped(true);
        setIsAutoFlipped(true);
      }, 1000);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (isAutoFlipped) {
      setIsFlipped(false);
      setIsAutoFlipped(false);
    }
  };

  const handleCardClick = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsFlipped(!isFlipped);
    setIsAutoFlipped(false);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isAutoFlipped && review.word) {
      if (review.word_id) {
        const audio = new Audio(`${api.defaults.baseURL}/api/audio/${review.word_id}`);
        audio.play().catch(() => fallbackSpeak(review.word));
      } else if (review.audio_url) {
        const audio = new Audio(review.audio_url);
        audio.play().catch(() => fallbackSpeak(review.word));
      } else {
        fallbackSpeak(review.word);
      }
    }
  }, [isAutoFlipped, review.word, review.audio_url, review.word_id]);

  const speak = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (review.word_id) {
      const audio = new Audio(`${api.defaults.baseURL}/api/audio/${review.word_id}`);
      audio.play().catch(() => fallbackSpeak(review.word));
    } else if (review.audio_url) {
      const audio = new Audio(review.audio_url);
      audio.play().catch(() => fallbackSpeak(review.word));
    } else {
      fallbackSpeak(review.word);
    }
  };

  const fallbackSpeak = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const response = await api.get('/api/dict', {
        params: {
          word: review.word,
          force_refresh: true,
          skip_lemma: true,
        },
      });
      const data = response.data;
      onRefresh?.(review.vocab_id, {
        meaning: data.meaning,
        phonetic: data.phonetic,
        audio_url: data.audio_url,
      });
    } catch (error) {
      console.error('Error refreshing word:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Modern "Cool" palette for cards
  const colors = [
    'from-indigo-500/20 to-blue-500/20 text-indigo-700 border-indigo-100',
    'from-purple-500/20 to-pink-500/20 text-purple-700 border-purple-100',
    'from-emerald-500/20 to-teal-500/20 text-emerald-700 border-emerald-100',
    'from-orange-500/20 to-yellow-500/20 text-orange-700 border-orange-100',
    'from-blue-500/20 to-cyan-500/20 text-blue-700 border-blue-100',
  ];
  const cardStyle = colors[index % colors.length];

  const [backHeight, setBackHeight] = useState(320);
  const measureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateHeight = () => {
      if (measureRef.current) {
        // Measure the content and add extra space for padding and borders
        const height = measureRef.current.offsetHeight + 40; // 40px for padding/footer buffer
        setBackHeight(Math.max(300, height));
      }
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    if (measureRef.current) observer.observe(measureRef.current);

    return () => observer.disconnect();
  }, [review.meaning, review.sentence]);

  return (
    <motion.div
      layout
      className="relative perspective-1000 cursor-pointer group break-inside-avoid w-full"
      onClick={handleCardClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      animate={{
        height: isFlipped ? backHeight : 200
      }}
      transition={{
        type: "spring",
        stiffness: 150,
        damping: 20,
        mass: 0.8,
        layout: { type: "spring", stiffness: 150, damping: 25 }
      }}
    >
      {/* Virtual measurement element with same styling */}
      <div 
        className="absolute top-0 left-0 w-full opacity-0 pointer-events-none -z-50 px-4 py-4 border-2 border-transparent"
        aria-hidden="true"
      >
        <div ref={measureRef} className="flex flex-col space-y-2  pr-1 custom-scrollbar">
          <div className="text-center pt-1">
            <h4 className="text-lg font-black leading-tight font-baloo">{review.word}</h4>
            <p className="text-indigo-400 text-sm">{review.phonetic}</p>
          </div>
          <div className="h-0.5 w-full" />
          <div className="space-y-1">
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-indigo-50">Meaning</span>
            <p className="text-base font-semibold leading-relaxed italic px-1 whitespace-pre-line">
              {review.meaning}
            </p>
          </div>
          {review.sentence && (
            <div className="pt-2">
              <h5 className="text-xs font-black uppercase tracking-widest mb-1.5 flex items-center gap-1">
                Context
              </h5>
              <div className="p-3 rounded-xl italic text-sm leading-relaxed border border-transparent bg-slate-50/50">
                &quot;{review.sentence}&quot;
              </div>
            </div>
          )}
          <div className="mt-2 pt-2 border-t border-transparent flex flex-col items-center">
            <div className="text-[8px] font-black uppercase tracking-widest">FLIP BACK</div>
          </div>
        </div>
      </div>

      <motion.div        
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ 
          type: "spring", 
          stiffness: 150, 
          damping: 20,
          mass: 0.8
        }}
        className="w-full h-full preserve-3d relative"
      >
        {/* Front of Card - Glass-Clay Hybrid */}
        <div className={`absolute inset-0 backface-hidden rounded-[32px] p-4 flex flex-col items-center justify-center text-center border-2 bg-gradient-to-br backdrop-blur-md shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1),inset_0_4px_8px_rgba(255,255,255,0.7),inset_0_-4px_8px_rgba(0,0,0,0.05)] ${cardStyle}`}>
          <div className="absolute top-0 left-0 w-full h-1/2 bg-white/30 rounded-t-[32px] pointer-events-none" style={{ clipPath: 'ellipse(100% 100% at 50% 0%)' }} />
          
          <button
            onClick={speak}
            onMouseEnter={() => {
              if (hoverTimerRef.current) {
                clearTimeout(hoverTimerRef.current);
                hoverTimerRef.current = null;
              }
            }}
            onMouseLeave={handleMouseEnter}
            className="absolute top-3 right-3 w-9 h-9 rounded-xl bg-white/80 text-indigo-500 hover:scale-110 active:scale-90 transition-all flex items-center justify-center shadow-sm border border-white/50 z-10"
          >
            <Volume2 className="w-4 h-4" />
          </button>
          
          <h3 className="text-2xl md:text-3xl font-black mb-1 break-words w-full drop-shadow-sm font-baloo">
            {review.word}
          </h3>
          <p className="font-bold text-[10px] opacity-60">
            {review.phonetic || '/.../'}
          </p>
          
          <div className="mt-4 opacity-20 group-hover:opacity-100 group-hover:text-indigo-500 transition-all duration-500 scale-75 group-hover:scale-100">
            <RotateCw className="w-5 h-5" />
          </div>
        </div>

        {/* Back of Card - Tactile Clean Design */}
        <div 
          className="absolute inset-0 backface-hidden rounded-[32px] bg-white p-4 flex flex-col rotate-y-180 border-2 border-slate-100 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1),inset_0_4px_8px_rgba(255,255,255,1)] overflow-hidden"
          style={{ transform: 'rotateY(180deg)' }}
        >
          <button
            onClick={handleRefresh}
            className="absolute top-3 right-3 w-9 h-9 rounded-xl bg-indigo-50 text-indigo-500 hover:scale-110 active:scale-90 transition-all flex items-center justify-center shadow-sm border border-indigo-100 z-10"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          <div className="flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
            <div className="text-center pt-1">
              <h4 className="text-lg font-black text-slate-800 leading-tight font-baloo">{review.word}</h4>
              <p className="text-indigo-400">{review.phonetic}</p>
            </div>
            
            <div className="h-0.5 bg-gradient-to-r from-transparent via-slate-100 to-transparent w-full" />
            
            <div className="space-y-1">
              <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest px-2 py-0.5 bg-indigo-50 rounded-full">Meaning</span>
              <p className="text-slate-700 font-semibold text-base leading-relaxed italic px-1 whitespace-pre-line">
                {review.meaning}
              </p>
            </div>

            {review.sentence && (
              <div className="pt-2">
                <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                  <History className="w-3 h-3 text-indigo-300" />
                  Context
                </h5>
                <div className="p-3 rounded-xl bg-slate-50/50 border border-slate-100 italic text-sm text-slate-500 leading-relaxed relative">
                  &quot;{review.sentence}&quot;
                </div>
              </div>
            )}
          </div>
          
          <div className="mt-2 pt-2 border-t border-slate-50 flex flex-col items-center">
            <div className="text-[8px] font-black text-slate-300 uppercase tracking-widest">
              FLIP BACK
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

function VocabGraph3DView({
  height,
  fullscreen,
  topOffset,
  wordMeaningByLabel,
  wordAudioByLabel,
}: {
  height?: number;
  fullscreen?: boolean;
  /**
   * Offset from the top of the viewport (e.g., sticky app header height),
   * used to keep overlays like the right-side details pad below the header.
   */
  topOffset?: number;
  wordMeaningByLabel: Map<string, string>;
  wordAudioByLabel: Map<string, { wordId?: number; audioUrl?: string }>;
}) {
  const graphRef = useRef<ForceGraphMethods<VocabGraphNode, VocabGraphLink> | null>(null);
  const starfieldRef = useRef<THREE.Points | null>(null);
  const nebulaBackgroundRef = useRef<THREE.CubeTexture | null>(null);
  const nebulaBackgroundLoadingRef = useRef(false);
  const bloomAddedRef = useRef(false);
  const coverOverlayHookedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [graphData, setGraphData] = useState<VocabGraphResponse | null>(null);
  const emptyGraphData = useMemo<VocabGraphResponse>(() => ({ nodes: [], links: [] }), []);
  const [containerHeight, setContainerHeight] = useState<number>(600);

  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const nodeById = useMemo(() => {
    const m = new Map<string, VocabGraphNode>();
    for (const n of graphData?.nodes ?? []) m.set(n.id, n);
    return m;
  }, [graphData]);

  const neighborsById = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    for (const l of graphData?.links ?? []) {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      if (!adj.has(s)) adj.set(s, new Set());
      if (!adj.has(t)) adj.set(t, new Set());
      adj.get(s)!.add(t);
      adj.get(t)!.add(s);
    }
    return adj;
  }, [graphData]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodeById.get(selectedNodeId) ?? null;
  }, [selectedNodeId, nodeById]);

  // Degree (number of connections) per node. Used to scale word/sentence nodes so
  // more-connected (more "important") nodes appear larger.
  const degreeById = useMemo(() => {
    const m = new Map<string, number>();
    if (!graphData) return m;
    for (const l of graphData.links) {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      m.set(s, (m.get(s) ?? 0) + 1);
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  }, [graphData]);

  const recomputeHeight = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const bottomPadding = 24; // keep a little breathing room above the app edge
    const height = Math.max(420, window.innerHeight - rect.top - bottomPadding);
    setContainerHeight(height);
  }, []);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.get<VocabGraphResponse>('/api/vocab/graph');
      setGraphData(resp.data);
    } catch (e) {
      console.error('Error fetching vocab graph:', e);
      setGraphData({ nodes: [], links: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Make the graph fill the remaining viewport area under the header
  useEffect(() => {
    // If height is explicitly provided, the parent controls sizing.
    if (typeof height === 'number') return;

    recomputeHeight();
    window.addEventListener('resize', recomputeHeight);
    // run again on next frame to catch layout settling (fonts, etc.)
    const raf = window.requestAnimationFrame(recomputeHeight);
    return () => {
      window.removeEventListener('resize', recomputeHeight);
      window.cancelAnimationFrame(raf);
    };
  }, [recomputeHeight, loading, height]);

  // Configure controls + postprocessing after graph mounts
  useEffect(() => {
    if (!graphRef.current) return;

    const fg = graphRef.current;
    
    // Initial camera position for fly-in effect if not already set
    if (!loading && fg.cameraPosition) {
      fg.cameraPosition({ x: 0, y: 0, z: 1200 }, { x: 0, y: 0, z: 0 }, 0);
      // Slightly further out so switching into the map/graph view doesn't feel "too zoomed in".
      fg.cameraPosition({ x: 0, y: 0, z: 1500 }, { x: 0, y: 0, z: 0 }, 2500);
    }

    const controls = fg.controls?.() as unknown;
    if (controls && typeof controls === 'object') {
      // 3d-force-graph returns OrbitControls here, but its types are `object`.
      const orbitControls = controls as { enableDamping?: boolean; dampingFactor?: number };
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.08;
    }

    // Add bloom once (affects the whole rendered scene by default).
    // We'll exclude book covers by rendering them as an overlay on a separate layer.
    if (!bloomAddedRef.current && fg.postProcessingComposer) {
      const composer = fg.postProcessingComposer();
      if (composer) {
        const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
        // Bloom tuning: keep a "glow" vibe but avoid overly glossy/washed-out nodes.
        // (Lower strength, non-zero threshold so only the brightest parts bloom.)
        const bloomPass = new UnrealBloomPass(size, 0.8, 0.5, 0.15);
        bloomPass.threshold = 0.15;
        bloomPass.strength = 0.75;
        bloomPass.radius = 0.35;
        composer.addPass(bloomPass);
        bloomAddedRef.current = true;
      }
    }

    // Hook a render overlay step so certain elements are drawn AFTER bloom and therefore never bloom.
    // Implementation approach:
    // - Put cover sprites on BOOK_COVER_LAYER
    // - Put word labels on WORD_LABEL_LAYER
    // - During composer render: camera renders default layer(s) only (covers/labels excluded)
    // - After composer render: render the overlay layers directly to screen
    if (!coverOverlayHookedRef.current && fg.postProcessingComposer && fg.renderer && fg.scene && fg.camera) {
      const composer = fg.postProcessingComposer();
      const renderer: THREE.WebGLRenderer | undefined = fg.renderer?.();
      const scene: THREE.Scene | undefined = fg.scene?.();
      const camera: THREE.Camera | undefined = fg.camera?.();

      if (composer && renderer && scene && camera) {
        const originalRender = composer.render.bind(composer);
        composer.render = (delta?: number) => {
          const prevMask = camera.layers.mask;
          const prevAutoClear = renderer.autoClear;
          const prevBackground = scene.background;

          // Inject the nebula cube map during the main render only, so the existing
          // node rendering path stays unchanged and overlay layers still draw cleanly.
          if (nebulaBackgroundRef.current) {
            scene.background = nebulaBackgroundRef.current;
          }

          // Render the main scene (everything except book covers) with bloom.
          camera.layers.set(0);
          originalRender(delta);
          scene.background = prevBackground;

          // Draw overlays on top with no postprocessing.
          renderer.autoClear = false;
          // Ensure the fullscreen postprocess quad doesn't block the overlay draw.
          renderer.clearDepth();
          for (const layer of [BOOK_COVER_LAYER, WORD_LABEL_LAYER]) {
            camera.layers.set(layer);
            renderer.render(scene, camera);
          }

          // Restore renderer/camera state.
          renderer.autoClear = prevAutoClear;
          camera.layers.mask = prevMask;
        };

        coverOverlayHookedRef.current = true;
      }
    }

    // Load the cube-texture nebula once. This is GPU-native and cheaper than adding
    // another large scene mesh, which helps keep graph FPS stable.
    if (!nebulaBackgroundRef.current && !nebulaBackgroundLoadingRef.current) {
      nebulaBackgroundLoadingRef.current = true;
      new THREE.CubeTextureLoader().load(
        [...NEBULA_CUBE_FACES],
        (texture) => {
          try {
            texture.colorSpace = THREE.SRGBColorSpace;
          } catch {
            // ignore if not supported by the installed three.js version/types
          }
          nebulaBackgroundRef.current = texture;
          nebulaBackgroundLoadingRef.current = false;
        },
        undefined,
        () => {
          nebulaBackgroundLoadingRef.current = false;
        }
      );
    }

    // Add lightweight starfield background once
    if (!starfieldRef.current && fg.scene) {
      const scene: THREE.Scene = fg.scene();
      const starsCount = 1200;
      const positions = new Float32Array(starsCount * 3);
      const radius = 1200;
      for (let i = 0; i < starsCount; i++) {
        // random-ish cube distribution, looks fine for starfield
        positions[i * 3 + 0] = (Math.random() - 0.5) * radius;
        positions[i * 3 + 1] = (Math.random() - 0.5) * radius;
        positions[i * 3 + 2] = (Math.random() - 0.5) * radius;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.2,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      });
      const points = new THREE.Points(geometry, material);
      points.renderOrder = -1;
      scene.add(points);
      starfieldRef.current = points;
    }

    return () => {
      try {
        if (starfieldRef.current && fg.scene) {
          fg.scene().remove(starfieldRef.current);
        }
      } catch {
        // ignore cleanup errors during fast refresh
      }
      starfieldRef.current = null;
    };
  }, [graphData, loading]);

  useEffect(() => {
    return () => {
      nebulaBackgroundRef.current?.dispose();
      nebulaBackgroundRef.current = null;
      nebulaBackgroundLoadingRef.current = false;
    };
  }, []);

  const getLinkKey = (l: LinkObject<VocabGraphNode, VocabGraphLink>) => {
    const getEndId = (end: unknown) => {
      if (typeof end === 'string' || typeof end === 'number') return String(end);
      if (end && typeof end === 'object' && 'id' in end) {
        const id = (end as { id?: string | number }).id;
        return id === undefined ? '' : String(id);
      }
      return '';
    };
    const s = getEndId(l.source);
    const t = getEndId(l.target);
    return `${s}__${t}`;
  };

  const buildConstellation = useCallback((focusId: string) => {
    if (!graphData) return { nodes: new Set<string>(), links: new Set<string>() };

    const adj = new Map<string, Set<string>>();
    const linkKeys = new Map<string, [string, string]>();

    for (const l of graphData.links) {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      if (!adj.has(s)) adj.set(s, new Set());
      if (!adj.has(t)) adj.set(t, new Set());
      adj.get(s)!.add(t);
      adj.get(t)!.add(s);
      linkKeys.set(`${s}__${t}`, [s, t]);
      linkKeys.set(`${t}__${s}`, [t, s]);
    }

    const visited = new Set<string>();
    const q: string[] = [focusId];
    visited.add(focusId);

    while (q.length) {
      const cur = q.shift()!;
      const neigh = adj.get(cur);
      if (!neigh) continue;
      for (const nxt of neigh) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          q.push(nxt);
        }
      }
    }

    const hlLinks = new Set<string>();
    for (const l of graphData.links) {
      const s = typeof l.source === 'string' ? l.source : l.source.id;
      const t = typeof l.target === 'string' ? l.target : l.target.id;
      if (visited.has(s) && visited.has(t)) {
        hlLinks.add(`${s}__${t}`);
      }
    }

    return { nodes: visited, links: hlLinks };
  }, [graphData]);

  const focusNode = useCallback((node: VocabGraphNode) => {
    const fg = graphRef.current;
    if (!fg) return;

    setSelectedNodeId(node.id);

    const id = node.id;
    const constellation = buildConstellation(id);
    setHighlightNodes(constellation.nodes);
    setHighlightLinks(constellation.links);

    const dist = 340;

    const nx = node.x ?? 0;
    const ny = node.y ?? 0;
    const nz = node.z ?? 0;
    const len = Math.hypot(nx, ny, nz) || 1;

    const targetCam = {
      x: nx + (nx / len) * dist,
      y: ny + (ny / len) * dist,
      z: nz + (nz / len) * dist,
    };

    // current camera position (three.js camera)
    const cam = fg.camera();
    const curCam = cam?.position ?? { x: 0, y: 0, z: 0 };

    // how far we move the camera
    const moveDist = Math.hypot(
      targetCam.x - curCam.x,
      targetCam.y - curCam.y,
      targetCam.z - curCam.z
    );

    // map distance -> duration (tune these numbers)
    const minMs = 900;
    const maxMs = 3600;
    const msPerUnit = 1.6; // e.g. 1.6ms per world-unit
    const duration = Math.max(minMs, Math.min(maxMs, moveDist * msPerUnit));

    fg.cameraPosition(targetCam, { x: nx, y: ny, z: nz }, duration);
  }, [buildConstellation]);

  const nodeObject = useCallback((node: VocabGraphNode) => {
    const isHighlighted = selectedNodeId ? highlightNodes.has(node.id) : true;
    const group = new THREE.Group();
    const type = node.type;

    const baseRadius =
      type === 'word' ? 7.5 :
      type === 'book' ? 9 :
      3.5;

    // Scale only word + sentence nodes by degree; keep book size stable.
    // Example: degree 0 -> 1.0x, degree ~10 -> ~1.6x (capped).
    const degree = degreeById.get(node.id) ?? 0;
    const scale =
      type === 'word' || type === 'sentence'
        ? Math.min(2.0, 1 + Math.sqrt(degree) * 0.20)
        : 1;
    const radius = baseRadius * scale;

    const baseColor = new THREE.Color(node.color || '#ffffff');

    // Book nodes: show cover image when available
    if (type === 'book' && node.image) {
      const coverMaterial = new THREE.SpriteMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: isHighlighted ? 1 : 0.25,
        depthWrite: false,
      });
      const coverSprite = new THREE.Sprite(coverMaterial);
      // Render covers in a separate layer so bloom doesn't affect them.
      coverSprite.layers.set(BOOK_COVER_LAYER);
      // Bigger cover for easier clicking/tapping
      // (Sprite size also affects raycast hit area in react-force-graph-3d)
      coverSprite.scale.set(54, 72, 1);
      group.add(coverSprite);

      // Extra invisible hit area to make the book easier to click on,
      // without changing visuals or affecting bloom.
      const hitGeometry = new THREE.PlaneGeometry(66, 87);
      const hitMaterial = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      });
      const hitPlane = new THREE.Mesh(hitGeometry, hitMaterial);
      group.add(hitPlane);

      const url = node.image;
      const cached = bookCoverTextureCache.get(url);
      if (cached) {
        coverMaterial.map = cached;
        coverMaterial.needsUpdate = true;
      } else {
        bookCoverTextureLoader.load(
          url,
          (tex) => {
            try {
              tex.colorSpace = THREE.SRGBColorSpace;
            } catch {
              // ignore if not supported
            }
            tex.anisotropy = 4;
            bookCoverTextureCache.set(url, tex);
            coverMaterial.map = tex;
            coverMaterial.needsUpdate = true;
          },
          undefined,
          () => {
            // ignore load errors; will fall back to glow-only
          }
        );
      }

      return group;
    }

    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: baseColor,
      // Reduce perceived shininess by increasing roughness and removing metallic specular.
      // We keep emissive for the star-map glow (bloom handles the "halo").
      emissiveIntensity: isHighlighted ? 0.75 : 0.12,
      roughness: 0.92,
      metalness: 0.0,
      transparent: true,
      opacity: isHighlighted ? 0.95 : 0.25,
    });

    const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 20), material);
    group.add(sphere);

    // Keep always-on labels for word nodes only.
    if (type === 'word') {
      const sprite = new SpriteText(node.label);
      // Clearer label color (requested): use white for word labels.
      sprite.color = '#FFFFFF';
      sprite.textHeight = type === 'word' ? 7 : 5.5;
      sprite.padding = 4;
      // Transparent label background (requested)
      sprite.backgroundColor = 'rgba(0,0,0,0)';
      // Remove label border (requested).
      sprite.borderColor = 'rgba(0,0,0,0)';
      sprite.borderWidth = 0;
      sprite.position.set(0, radius + 6, 0);
      sprite.material.transparent = true;
      sprite.material.opacity = isHighlighted ? 1 : 0.25;
      // Improve readability: ensure the text isn't occluded by the node sphere.
      sprite.material.depthTest = false;
      sprite.renderOrder = 999;
      // Keep labels crisp (no bloom "shine") by drawing them in an overlay layer.
      sprite.layers.set(WORD_LABEL_LAYER);
      group.add(sprite);
    }

    return group;
  }, [degreeById, highlightNodes, selectedNodeId]);

  const onNodeClick = useCallback((node: VocabGraphNode) => {
    focusNode(node);
  }, [focusNode]);

  const selectedWordMeaning = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'word') return null;
    return wordMeaningByLabel.get(selectedNode.label) ?? '';
  }, [selectedNode, wordMeaningByLabel]);

  const fallbackSpeak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  }, []);

  const handlePlaySelected = useCallback(async () => {
    if (!selectedNode) return;

    // Words: use same behavior as Word Wall cards (word audio API / audio_url, else synthesis).
    if (selectedNode.type === 'word') {
      const audioInfo = wordAudioByLabel.get(selectedNode.label);
      const wordId = audioInfo?.wordId;
      const audioUrl = audioInfo?.audioUrl;

      if (wordId) {
        const audio = new Audio(`${api.defaults.baseURL}/api/audio/${wordId}`);
        audio.play().catch(() => fallbackSpeak(selectedNode.label));
        return;
      }
      if (audioUrl) {
        const audio = new Audio(audioUrl);
        audio.play().catch(() => fallbackSpeak(selectedNode.label));
        return;
      }
      fallbackSpeak(selectedNode.label);
      return;
    }

    // Sentences: use same behavior as Reader (TTS API /api/tts, else synthesis).
    if (selectedNode.type === 'sentence') {
      const text = selectedNode.label;
      try {
        const response = await api.post('/api/tts', null, { params: { text } });
        const url = response.data?.audio_url;
        if (url) {
          const audio = new Audio(url);
          audio.play().catch(() => fallbackSpeak(text));
          return;
        }
      } catch (e) {
        console.error('Error playing sentence TTS:', e);
      }
      fallbackSpeak(text);
    }
  }, [selectedNode, wordAudioByLabel, fallbackSpeak]);

  const selectedWordSentences = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'word') return [];
    const neigh = neighborsById.get(selectedNode.id);
    if (!neigh) return [];
    const out: VocabGraphNode[] = [];
    for (const id of neigh) {
      const n = nodeById.get(id);
      if (n?.type === 'sentence') out.push(n);
    }
    // stable-ish ordering: by label
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [selectedNode, neighborsById, nodeById]);

  const selectedSentenceBook = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'sentence') return null;
    const neigh = neighborsById.get(selectedNode.id);
    if (!neigh) return null;
    for (const id of neigh) {
      const n = nodeById.get(id);
      if (n?.type === 'book') return n;
    }
    return null;
  }, [selectedNode, neighborsById, nodeById]);

  const selectedSentenceWords = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'sentence') return [];
    const neigh = neighborsById.get(selectedNode.id);
    if (!neigh) return [];
    const out: VocabGraphNode[] = [];
    for (const id of neigh) {
      const n = nodeById.get(id);
      if (n?.type === 'word') out.push(n);
    }
    // stable-ish ordering: by label
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [selectedNode, neighborsById, nodeById]);

  const selectedBookSentences = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'book') return [];
    const neigh = neighborsById.get(selectedNode.id);
    if (!neigh) return [];
    const out: VocabGraphNode[] = [];
    for (const id of neigh) {
      const n = nodeById.get(id);
      if (n?.type === 'sentence') out.push(n);
    }
    // stable-ish ordering: by label
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
  }, [selectedNode, neighborsById, nodeById]);

  if (loading) {
    return (
      <div
        ref={containerRef}
        style={{ height: typeof height === 'number' ? height : containerHeight }}
        className={`w-full border border-white/10 bg-[#000005] flex items-center justify-center ${
          fullscreen ? 'rounded-none' : 'rounded-[32px]'
        }`}
      >
        <div className="flex items-center gap-3 text-white/70">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          <span className="font-bold">Rendering star map…</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height: typeof height === 'number' ? height : containerHeight }}
      className={`w-full overflow-hidden border border-white/10 bg-gradient-to-b from-[#00000a] to-[#000005] relative ${
        fullscreen ? 'rounded-none shadow-none' : 'rounded-[32px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]'
      }`}
    >
      {/* Subtle nebula glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-indigo-600/10 blur-3xl rounded-full" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-cyan-400/10 blur-3xl rounded-full" />
      </div>

      <ForceGraph3D
        ref={graphRef}
        graphData={graphData ?? emptyGraphData}
        backgroundColor="#000005"
        showNavInfo={false}
        nodeThreeObject={nodeObject}
        // No hover labels for book nodes (titles are removed from the 3D view).
        nodeLabel={(node: NodeObject<VocabGraphNode>) => {
          const n = node as VocabGraphNode;
          if (n.type === 'book') return '';
          if (n.type === 'word') {
            const meaning = wordMeaningByLabel.get(n.label) || '';
            // react-force-graph uses this as HTML for tooltip.
            return meaning
              ? `<div style="max-width:260px"><div style="font-weight:800;margin-bottom:4px">${n.label}</div><div style="opacity:0.85;white-space:pre-line">${meaning}</div></div>`
              : n.label;
          }
          return n.label;
        }}
        linkOpacity={0.35}
        linkWidth={(l: LinkObject<VocabGraphNode, VocabGraphLink>) =>
          highlightLinks.has(getLinkKey(l)) ? 1.2 : 0.35
        }
        linkColor={(l: LinkObject<VocabGraphNode, VocabGraphLink>) =>
          highlightLinks.has(getLinkKey(l))
            ? 'rgba(255,255,255,0.90)'
            : 'rgba(150,160,255,0.35)'
        }
        linkDirectionalParticles={(l: LinkObject<VocabGraphNode, VocabGraphLink>) =>
          highlightLinks.has(getLinkKey(l)) ? 4 : 0
        }
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleSpeed={0.01}
        onNodeClick={onNodeClick}
        onBackgroundClick={() => {
          setHighlightNodes(new Set());
          setHighlightLinks(new Set());
          setSelectedNodeId(null);
        }}
        onEngineStop={() => {
          try {
            graphRef.current?.zoomToFit?.(700, 90);
          } catch {
            // ignore
          }
        }}
      />

      <div className="absolute bottom-5 left-5 text-[11px] font-semibold text-white/60 backdrop-blur-sm bg-black/20 border border-white/10 rounded-2xl px-3 py-2">
        Click a node to focus and highlight its constellation. Click empty space to clear.
      </div>

      {/* Right-side details pad */}
      <div
        className="absolute right-5 bottom-5 w-[380px] pointer-events-none"
        style={{ top: (topOffset ?? 0) + 20 }}
      >
        <div className="h-full pointer-events-auto rounded-3xl border border-white/12 bg-black/35 backdrop-blur-xl shadow-[0_30px_60px_-20px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col">
            {selectedNode ? (
              <>
                <div className="px-5 py-4 border-b border-white/10 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/60">
                        {selectedNode.type}
                      </div>
                      <div className="w-1 h-1 rounded-full bg-white/25" />
                      <div className="text-[10px] font-bold text-white/50">
                        {neighborsById.get(selectedNode.id)?.size ?? 0} links
                      </div>
                    </div>
                    <div
                      className={`mt-1 text-white font-extrabold leading-snug ${
                        selectedNode.type === 'sentence'
                          ? 'text-base whitespace-normal break-words'
                          : 'text-lg truncate'
                      }`}
                    >
                      {selectedNode.label}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {(selectedNode.type === 'word' || selectedNode.type === 'sentence') && (
                      <button
                        type="button"
                        onClick={handlePlaySelected}
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                        aria-label="Play"
                        title="Play"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
                  {selectedNode.type === 'word' && (
                    <>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/55">
                          Meaning
                        </div>
                        <div className="mt-1 text-white/90 leading-relaxed whitespace-pre-line">
                          {selectedWordMeaning ? selectedWordMeaning : <span className="text-white/50">No meaning saved.</span>}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/55">
                            Sentences
                          </div>
                          <div className="text-[11px] font-semibold text-white/45">
                            {selectedWordSentences.length}
                          </div>
                        </div>
                        <div className="mt-2 space-y-2">
                          {selectedWordSentences.length === 0 ? (
                            <div className="text-sm text-white/50">No connected sentences.</div>
                          ) : (
                            selectedWordSentences.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => focusNode(s)}
                                className="w-full text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors px-4 py-3"
                              >
                                <div className="text-sm text-white/80 leading-relaxed">
                                  “{s.label}”
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {selectedNode.type === 'sentence' && (
                    <>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/55">
                            Words
                          </div>
                          <div className="text-[11px] font-semibold text-white/45">
                            {selectedSentenceWords.length}
                          </div>
                        </div>
                        <div className="mt-2 space-y-2">
                          {selectedSentenceWords.length === 0 ? (
                            <div className="text-sm text-white/50">No connected words.</div>
                          ) : (
                            selectedSentenceWords.map((w) => (
                              <button
                                key={w.id}
                                type="button"
                                onClick={() => focusNode(w)}
                                className="w-full text-left rounded-xl px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors"
                              >
                                <div className="text-white font-bold truncate">
                                  {w.label}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/55">
                          Book
                        </div>
                        <div className="mt-2">
                          {selectedSentenceBook ? (
                            <button
                              type="button"
                              onClick={() => focusNode(selectedSentenceBook)}
                              className="w-full text-left rounded-xl px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors"
                            >
                              <div className="text-white font-bold">
                                {selectedSentenceBook.label}
                              </div>
                              <div className="text-xs text-white/50 mt-0.5">
                                Click to open book details
                              </div>
                            </button>
                          ) : (
                            <div className="text-sm text-white/50">No connected book.</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {selectedNode.type === 'book' && (
                    <>
                      {selectedNode.image && (
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 flex gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={selectedNode.image}
                            alt={selectedNode.label}
                            className="w-24 h-30 rounded-xl object-cover border border-white/10"
                          />
                          <div className="min-w-0">
                            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/55">
                              Book
                            </div>
                            <div className="mt-1 text-white font-extrabold leading-snug">
                              {selectedNode.label}
                            </div>
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/55">
                            Sentences
                          </div>
                          <div className="text-[11px] font-semibold text-white/45">
                            {selectedBookSentences.length}
                          </div>
                        </div>

                        <div className="mt-2 space-y-2">
                          {selectedBookSentences.length === 0 ? (
                            <div className="text-sm text-white/50">No connected sentences.</div>
                          ) : (
                            selectedBookSentences.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => focusNode(s)}
                                className="w-full text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors px-4 py-3"
                              >
                                <div className="text-sm text-white/80 leading-relaxed">
                                  “{s.label}”
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-white/10 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/60">
                      details
                    </div>
                    <div className="mt-1 text-white font-extrabold text-lg leading-snug">
                      Select a node
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
                  <div className="text-sm text-white/75 leading-relaxed">
                    Click any word, sentence, or book to see its connections here.
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-white/55">
                      Tips
                    </div>
                    <ul className="mt-2 text-sm text-white/70 space-y-1 list-disc pl-5">
                      <li>Drag to orbit the camera</li>
                      <li>Scroll / trackpad pinch to zoom</li>
                      <li>Click empty space to clear highlights</li>
                    </ul>
                  </div>
                </div>
              </>
            )}
        </div>
      </div>
    </div>
  );
}

export default function Review({ onBack }: ReviewProps) {
  const [reviews, setReviews] = useState<VocabReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'wall' | 'graph' | 'game'>('wall');
  const [graphSceneReady, setGraphSceneReady] = useState(false);
  const [gameSession, setGameSession] = useState<GameSession>({
    currentLevel: 1,
    cumulativeScore: 0,
    status: 'idle',
  });
  const [columns, setColumns] = useState(2);
  const [mounted, setMounted] = useState(false);
  const fetchedRef = useRef(false);
  const [appHeaderBottom, setAppHeaderBottom] = useState<number>(0);
  const [viewportHeight, setViewportHeight] = useState<number>(0);

  const wordMeaningByLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reviews) {
      if (r.word) m.set(r.word, r.meaning ?? '');
    }
    return m;
  }, [reviews]);

  const wordAudioByLabel = useMemo(() => {
    const m = new Map<string, { wordId?: number; audioUrl?: string }>();
    for (const r of reviews) {
      if (!r.word) continue;
      m.set(r.word, { wordId: r.word_id, audioUrl: r.audio_url ?? undefined });
    }
    return m;
  }, [reviews]);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/vocab/all');
      setReviews(response.data);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleWordRefresh = useCallback((vocabId: number, data: { meaning?: string; phonetic?: string; audio_url?: string }) => {
    setReviews(prev => prev.map(r => 
      r.vocab_id === vocabId 
        ? { ...r, meaning: data.meaning ?? r.meaning, phonetic: data.phonetic ?? r.phonetic, audio_url: data.audio_url ?? r.audio_url }
        : r
    ));
  }, []);

  useEffect(() => {
    setMounted(true);
    const updateColumns = () => {
      if (window.innerWidth >= 1024) setColumns(4);
      else if (window.innerWidth >= 768) setColumns(3);
      else setColumns(2);
    };
    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchReviews();
    fetchedRef.current = true;
  }, [fetchReviews]);

  // Used to size the full-bleed graph as: height = 100vh - header.
  useEffect(() => {
    const compute = () => {
      const header = document.querySelector('header');
      setViewportHeight(window.innerHeight);
      if (!header) {
        setAppHeaderBottom(0);
        return;
      }
      const rect = header.getBoundingClientRect();
      setAppHeaderBottom(Math.max(0, rect.bottom));
    };

    compute();
    window.addEventListener('resize', compute);
    const raf = window.requestAnimationFrame(compute);
    return () => {
      window.removeEventListener('resize', compute);
      window.cancelAnimationFrame(raf);
    };
  }, []);

  // Avoid mounting the heavy 3D graph during the mode transition animation (prevents FPS drops).
  useEffect(() => {
    if (mode === 'graph') setGraphSceneReady(false);
  }, [mode]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-24 gap-6">
      <div className="relative">
        <div className="w-20 h-20 border-8 border-green-100 border-t-green-500 rounded-full animate-spin shadow-inner" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-green-400 animate-pulse" />
        </div>
      </div>
      <p className="text-xl font-black text-green-600 font-baloo tracking-tight">Summoning your Word Wall...</p>
    </div>
  );

  if (reviews.length === 0) {
    return (
      <div className="max-w-md mx-auto py-24 text-center space-y-8 animate-in zoom-in-95 duration-700">
        <div className="relative inline-block">
          <div className="w-32 h-32 rounded-[40px] bg-white shadow-clay-lg border-2 border-green-50 flex items-center justify-center text-green-500">
            <Check className="w-16 h-16" />
          </div>
          <motion.div 
            animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 4 }}
            className="absolute -top-4 -right-4 w-12 h-12 rounded-2xl bg-yellow-400 flex items-center justify-center text-white shadow-lg"
          >
            <Sparkles className="w-6 h-6" />
          </motion.div>
        </div>
        <div>
          <h2 className="text-4xl font-black text-slate-800 mb-4 font-baloo">
            <span className="bg-gradient-to-r from-green-600 to-teal-500 bg-clip-text text-transparent">Pure Magic!</span> ✨
          </h2>
          <p className="text-green-600 text-xl font-medium px-8">Your Word Wall is waiting for its first collection. Start reading to find magical words!</p>
        </div>
        <button onClick={onBack} className="clay-button clay-primary w-full py-5 text-xl shadow-xl">
          Start Reading Adventure
        </button>
      </div>
    );
  }

  // Full-bleed 3D view: fill width of page, height = 100vh - header
  const vh = viewportHeight || (typeof window !== 'undefined' ? window.innerHeight : 0);
  const graphHeight = Math.max(320, vh);

  const renderModeToggle = () => {
    if (loading || reviews.length === 0 || mode === 'game') return null;
    const isGraph = mode === 'graph';
    return (
      <div
        className="fixed left-6 z-40"
        style={{ top: appHeaderBottom + 12 }}
      >
        <div
          className={`inline-flex p-0.5 rounded-lg shadow-sm backdrop-blur-sm ${
            isGraph
              ? 'bg-emerald-500/10 border border-emerald-300/20'
              : 'bg-emerald-50/90 border border-emerald-200/70'
          }`}
        >
          <button
            type="button"
            aria-label="Wall view"
            title="Wall"
            onClick={() => setMode('wall')}
            className={`w-8 h-8 rounded-md flex items-center justify-center transition-all duration-200 ${
              mode === 'wall'
                ? isGraph
                  ? 'bg-emerald-400/25 text-white shadow-md scale-105'
                  : 'bg-emerald-600 text-white shadow-md scale-105'
                : isGraph
                  ? 'text-emerald-100/75 hover:bg-emerald-400/10'
                  : 'text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Graph view"
            title="Graph"
            onClick={() => setMode('graph')}
            className={`w-8 h-8 rounded-md flex items-center justify-center transition-all duration-200 ${
              mode === 'graph'
                ? isGraph
                  ? 'bg-emerald-400/25 text-white shadow-md scale-105'
                  : 'bg-emerald-600 text-white shadow-md scale-105'
                : isGraph
                  ? 'text-emerald-100/75 hover:bg-emerald-400/10'
                  : 'text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <Orbit className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full min-h-screen">
      {renderModeToggle()}

      <AnimatePresence mode="wait">
        {mode === 'game' ? (
          <motion.div
            key="game-view"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="w-full"
          >
            {(() => {
              const resetSession = (gameType?: 'match' | 'completion') => {
                setGameSession({ 
                  currentLevel: 1, 
                  cumulativeScore: 0, 
                  status: gameType ? 'playing' : 'idle', 
                  gameType: gameType 
                });
              };

              const handleRestart = () => {
                resetSession(gameSession.gameType);
              };

              const handleLevelComplete = (level: number, score: number, stats: LevelStats) => {
                const newCumulative = gameSession.cumulativeScore + score;
                const bonusTime = stats.timeLeft;
                setGameSession(prev => ({
                  ...prev,
                  currentLevel: level,
                  cumulativeScore: newCumulative,
                  status: level >= 5 ? 'all-complete' : 'level-stats',
                  levelStats: stats,
                  bonusTime: bonusTime,
                }));
              };

              const levels = gameSession.gameType === 'match' ? MATCH_GAME_LEVELS : COMPLETION_GAME_LEVELS;

              if (gameSession.status === 'level-stats' && gameSession.levelStats) {
                const stats = gameSession.levelStats;
                const nextLevel = gameSession.currentLevel + 1;
                const totalLevels = levels.length;
                const currentLevelNum = gameSession.currentLevel;
                const levelsRemaining = totalLevels - currentLevelNum;
                
                return (
                  <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
                    <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-green-200 rounded-full blur-3xl opacity-40 animate-levitate pointer-events-none" />
                    <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-200 rounded-full blur-3xl opacity-40 animate-levitate delay-200 pointer-events-none" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-radial from-indigo-100/50 to-transparent rounded-full pointer-events-none" />
                    
                    <div className="relative flex flex-col items-center gap-6 animate-in zoom-in-95 duration-500">
                      <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                        className="relative"
                      >
                        <div className="w-28 h-28 rounded-[36px] flex items-center justify-center text-white shadow-2xl bg-gradient-to-br from-green-400 to-emerald-500">
                          <Trophy className="w-14 h-14" />
                        </div>
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.3, type: 'spring' }}
                          className="absolute -top-2 -right-2 w-10 h-10 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg"
                        >
                          <Sparkles className="w-5 h-5 text-white" />
                        </motion.div>
                      </motion.div>
                      
                      <div className="text-center space-y-1">
                        <h2 className="text-3xl font-black text-slate-800">Level {currentLevelNum} Complete!</h2>
                        <p className="text-base font-medium text-slate-500">
                          {levelsRemaining > 0 ? `${levelsRemaining} more level${levelsRemaining > 1 ? 's' : ''} to go!` : 'All levels completed!'}
                        </p>
                      </div>
                      
                      <div className="w-full max-w-sm">
                        <div className="flex items-center justify-between">
                          {Array.from({ length: totalLevels }, (_, i) => i + 1).map((level, index) => (
                            <div key={level} className="flex items-center">
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.3 + index * 0.1 }}
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                  level <= currentLevelNum
                                    ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-lg shadow-green-200'
                                    : 'bg-slate-200 text-slate-400'
                                }`}
                              >
                                {level <= currentLevelNum ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  level
                                )}
                              </motion.div>
                              {index < totalLevels - 1 && (
                                <div className={`w-8 h-1 mx-1 rounded ${level < currentLevelNum ? 'bg-green-400' : 'bg-slate-200'}`} />
                              )}
                            </div>
                          ))}
                        </div>
                        <p className="text-center text-xs font-semibold text-slate-400 mt-2">
                          {currentLevelNum} / {totalLevels} completed
                        </p>
                      </div>
                      
                      <div className="flex gap-4 w-full max-w-md">
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
                          className="flex-1 rounded-2xl bg-white/20 backdrop-blur-2xl border border-white/30 shadow-[0_8px_32px_rgba(99,102,241,0.15),inset_0_1px_0_rgba(255,255,255,0.4)] p-4 text-center flex flex-col justify-center relative overflow-hidden hover:scale-[1.02] hover:-translate-y-1 transition-all duration-150 ease-out cursor-default"
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-indigo-500/10" />
                          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                          <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1 whitespace-nowrap">Best Streak</p>
                          <p className="text-3xl font-black text-indigo-700 leading-none">{stats.bestStreak}</p>
                          <p className="text-xs text-indigo-500 mt-1">consecutive</p>
                        </motion.div>
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3, type: 'spring', stiffness: 300, damping: 25 }}
                          className="flex-1 rounded-2xl bg-white/20 backdrop-blur-2xl border border-white/30 shadow-[0_8px_32px_rgba(16,185,129,0.15),inset_0_1px_0_rgba(255,255,255,0.4)] p-4 text-center flex flex-col justify-center relative overflow-hidden hover:scale-[1.02] hover:-translate-y-1 transition-all duration-150 ease-out cursor-default"
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-emerald-500/10" />
                          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 whitespace-nowrap">Avg Speed</p>
                          <p className="text-3xl font-black text-emerald-700 leading-none">{stats.avgSecondsPerMatch.toFixed(1)}s</p>
                          <p className="text-xs text-emerald-500 mt-1">per match</p>
                        </motion.div>
                      </div>
                      
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-sm text-slate-500 font-medium"
                      >
                        {stats.totalMatches} matches in {stats.timeUsed}s
                      </motion.div>
                      
                      <motion.button
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 25 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setGameSession(prev => ({ ...prev, currentLevel: nextLevel, status: 'playing' }))}
                        className="px-8 py-3 rounded-2xl font-bold transition-all text-base bg-green-500 text-white shadow-lg shadow-green-200 hover:shadow-xl hover:shadow-green-300 hover:scale-105 group"
                      >
                        <div className="flex items-center">
                          <Play className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform duration-150" />
                          <span>Level {nextLevel}</span>
                        </div>
                      </motion.button>
                    </div>
                  </div>
                );
              }

              if (gameSession.status === 'all-complete') {
                const totalTarget = levels.reduce((sum, l) => sum + l.matchTarget, 0);
                const totalLevels = levels.length;
                const scorePercent = Math.min((gameSession.cumulativeScore / totalTarget) * 100, 100);
                
                return (
                  <div className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
                    <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-green-200 rounded-full blur-3xl opacity-50 animate-levitate pointer-events-none" />
                    <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-200 rounded-full blur-3xl opacity-50 animate-levitate delay-200 pointer-events-none" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-amber-100/60 to-transparent rounded-full pointer-events-none" />
                    
                    <div className="relative flex flex-col items-center gap-8 animate-in zoom-in-95 duration-500">
                      <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                        className="relative"
                      >
                        <div className="w-32 h-32 rounded-[40px] flex items-center justify-center text-white shadow-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500">
                          <Trophy className="w-16 h-16" />
                        </div>
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.4, type: 'spring' }}
                          className="absolute -top-3 -right-3"
                        >
                          <div className="relative">
                            <div className="w-12 h-12 bg-gradient-to-r from-yellow-300 to-amber-400 rounded-full flex items-center justify-center shadow-lg">
                              <Sparkles className="w-6 h-6 text-white" />
                            </div>
                            <motion.div
                              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                              transition={{ repeat: Infinity, duration: 1.5 }}
                              className="absolute inset-0 bg-yellow-300 rounded-full blur-md"
                            />
                          </div>
                        </motion.div>
                      </motion.div>
                      
                      <div className="text-center space-y-3">
                        <motion.h2
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                          className="text-4xl font-black text-slate-800"
                        >
                          All Levels Complete!
                        </motion.h2>
                        <motion.p
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                          className="text-xl font-bold text-slate-500"
                        >
                          Final Score: {gameSession.cumulativeScore} / {totalTarget}
                        </motion.p>
                      </div>
                      
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="w-full max-w-sm"
                      >
                        <div className="flex justify-between text-xs font-semibold text-slate-400 mb-2">
                          <span>All {totalLevels} Levels</span>
                          <span>{Math.round(scorePercent)}%</span>
                        </div>
                        <div className="h-4 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${scorePercent}%` }}
                            transition={{ delay: 0.5, duration: 0.8, ease: 'easeOut' }}
                            className="h-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 rounded-full relative"
                          >
                            <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent" />
                            <motion.div
                              animate={{ x: ['-100%', '100%'] }}
                              transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12"
                            />
                          </motion.div>
                        </div>
                      </motion.div>
                      
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="flex gap-6"
                      >
                        <div className="flex items-center gap-2 text-slate-500">
                          <Target className="w-5 h-5 text-indigo-500" />
                          <span className="font-medium">{totalLevels} Levels</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-500">
                          <Sparkles className="w-5 h-5 text-amber-500" />
                          <span className="font-medium">{gameSession.cumulativeScore} Points</span>
                        </div>
                      </motion.div>
                      
                      <motion.button
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => { setMode('wall'); resetSession(); }}
                        className="px-8 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-lg shadow-indigo-200/50 hover:shadow-xl hover:shadow-indigo-300/50 transition-all relative overflow-hidden group"
                      >
                        <span className="relative z-10">Return to Word Wall</span>
                        <div className="absolute inset-0 bg-gradient-to-r from-pink-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </motion.button>
                    </div>
                  </div>
                );
              }

              const cfg = levels[gameSession.currentLevel - 1];
              if (gameSession.gameType === 'match') {
                return (
                  <WordMatchGame
                    key={`match-${gameSession.currentLevel}`}
                    reviews={reviews}
                    onBack={() => { setMode('wall'); resetSession(); }}
                    onRestart={handleRestart}
                    onLevelComplete={handleLevelComplete}
                    mode={cfg.mode}
                    level={cfg.level}
                    timeLimit={cfg.timeLimit}
                    bonusTime={gameSession.bonusTime}
                    matchTarget={cfg.matchTarget}
                    soundThreshold={cfg.soundThreshold}
                    cumulativeScore={gameSession.cumulativeScore}
                  />
                );
              } else {
                return (
                  <WordCompletionGame
                    key={`completion-${gameSession.currentLevel}`}
                    reviews={reviews}
                    onBack={() => { setMode('wall'); resetSession(); }}
                    onRestart={handleRestart}
                    onLevelComplete={handleLevelComplete}
                    level={cfg.level}
                    timeLimit={cfg.timeLimit}
                    bonusTime={gameSession.bonusTime}
                    matchTarget={cfg.matchTarget}
                    cumulativeScore={gameSession.cumulativeScore}
                  />
                );
              }
            })()}
          </motion.div>
        ) : mode === 'graph' ? (
          <motion.div
            key="graph-view"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="fixed inset-0 z-20"
            onAnimationComplete={() => setGraphSceneReady(true)}
          >
            {graphSceneReady ? (
              <VocabGraph3DView
                height={graphHeight}
                fullscreen
                topOffset={appHeaderBottom}
                wordMeaningByLabel={wordMeaningByLabel}
                wordAudioByLabel={wordAudioByLabel}
              />
            ) : (
              <div className="relative w-full h-full bg-[#000005] overflow-hidden">
                {/* lightweight "galaxy" backdrop while transition finishes */}
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute -top-40 -left-40 w-[560px] h-[560px] bg-indigo-600/10 blur-3xl rounded-full" />
                  <div className="absolute -bottom-48 -right-48 w-[680px] h-[680px] bg-cyan-400/10 blur-3xl rounded-full" />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent" />
                </div>

                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-2 border-emerald-200/30 border-t-emerald-300/80 animate-spin" />
                    <div className="text-sm font-semibold text-white/70">
                      Loading galaxy…
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="wall-view"
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.98 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="max-w-6xl mx-auto w-full px-4 md:px-6"
          >
            {mode === 'wall' && reviews.length >= 5 && (
              <div className="fixed bottom-8 right-8 flex flex-col gap-4 z-20">
                <motion.button
                  initial={{ opacity: 0, scale: 0.8, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setGameSession({ currentLevel: 1, cumulativeScore: 0, status: 'playing', gameType: 'match' });
                    setMode('game');
                  }}
                  className="px-5 py-2.5 rounded-2xl font-bold transition-all text-base bg-green-500 text-white shadow-lg shadow-green-200 hover:shadow-xl hover:shadow-green-300 group"
                >
                  <div className="flex items-center">
                    <Gamepad2 className="w-7 h-7 mr-2 group-hover:rotate-12 group-hover:scale-125 transition-transform" />
                    <span>Play Match Game</span>
                  </div>
                </motion.button>

                <motion.button
                  initial={{ opacity: 0, scale: 0.8, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setGameSession({ currentLevel: 1, cumulativeScore: 0, status: 'playing', gameType: 'completion' });
                    setMode('game');
                  }}
                  className="px-5 py-2.5 rounded-2xl font-bold transition-all text-base bg-amber-500 text-white shadow-lg shadow-amber-200 hover:shadow-xl hover:shadow-amber-300 group"
                >
                  <div className="flex items-center">
                    <Sparkles className="w-7 h-7 mr-2 group-hover:rotate-12 group-hover:scale-125 transition-transform" />
                    <span>Fill-in-Word Game</span>
                  </div>
                </motion.button>
              </div>
            )}
            
            <div className="space-y-8 py-8">
              <div className="relative">
                <Title 
                  title="Word Wall" 
                  subtitle="Your magical word collection!"
                  icon={<BookOpen className="w-8 h-8 text-white drop-shadow-lg" />}
                  badge={{ icon: <Target className="w-5 h-5 text-white" />, text: `${reviews.length} words collected!` }}
                />
              </div>

              <div className="flex gap-6 md:gap-8 pb-20 items-start">
                {mounted ? (
                  Array.from({ length: columns }).map((_, colIdx) => (
                    <div key={colIdx} className="flex-1 flex flex-col gap-6 md:gap-8">
                      <AnimatePresence mode="popLayout">
                        {reviews.filter((_, idx) => idx % columns === colIdx).map((review) => {
                          const originalIndex = reviews.findIndex(r => r.vocab_id === review.vocab_id);
                          return (
                            <motion.div
                              key={review.vocab_id}
                              layout
                              initial={{ opacity: 0, y: 30, scale: 0.9 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              transition={{ 
                                type: "spring", 
                                stiffness: 100, 
                                damping: 20,
                                delay: originalIndex * 0.05 
                              }}
                            >
                              <ClayWordCard 
                                review={review} 
                                index={originalIndex}
                                onRefresh={handleWordRefresh}
                              />
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  ))
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8 w-full">
                    {reviews.map((review, idx) => (
                      <div key={review.vocab_id}>
                        <ClayWordCard review={review} index={idx} onRefresh={handleWordRefresh} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
