import "../lib/theme.css";
import "../lib/paper.css";
import { mount } from "svelte";
import { installTextures } from "../lib/textures";
import Overlay from "./Overlay.svelte";

installTextures();
mount(Overlay, { target: document.getElementById("app")! });
