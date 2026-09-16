const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

/*
 * Hide the web app's node_modules from the bundler.
 *
 * This directory sits inside the web app's repository, and the repository root
 * has its own node_modules holding React 19.2.8 for Next.js while this project
 * pins 19.2.3 for React Native. Metro's resolver walks up the directory tree,
 * so an import could be answered by whichever copy it reached first — and two
 * Reacts in one bundle means hooks throwing "invalid hook call" at runtime,
 * from a stack trace pointing at innocent code. `expo-doctor` reports the pair
 * as duplicate native modules for the same reason.
 *
 * Blocking that one directory is deliberately narrower than
 * `disableHierarchicalLookup`, which fixes this too but switches off a whole
 * resolver feature and trips expo-doctor's Metro check. Here the default
 * resolution strategy is untouched; the parent's packages simply do not exist
 * as far as the bundler is concerned.
 */
const parentModules = path.resolve(__dirname, "..", "node_modules");
const escaped = parentModules.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
config.resolver.blockList = [new RegExp(`^${escaped}\\${path.sep}.*`)];

// Metro watches the project root by default. Without this it also crawls the
// parent's node_modules and .next build output — thousands of files the app
// never imports, and a slow first start on Windows.
config.watchFolders = [__dirname];

module.exports = config;
