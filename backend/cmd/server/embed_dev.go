//go:build dev

package main

import "io/fs"

// frontendFS is empty in dev mode; the frontend runs on its own Vite dev server.
var frontendFS fs.FS
