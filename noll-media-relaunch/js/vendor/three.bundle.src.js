// Builds js/vendor/three.bundle.js: three.js core + the addons the case pages
// use, exposed as window.NollThree for plain (non-module) scripts, so the page
// also works when opened straight from disk (file://).
// Rebuild: npx esbuild three.bundle.src.js --bundle --minify --format=iife --outfile=three.bundle.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
window.NollThree = Object.assign({}, THREE, { GLTFLoader, MeshoptDecoder, EffectComposer, RenderPass, GTAOPass, OutputPass });
