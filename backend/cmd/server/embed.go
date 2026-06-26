//go:build !dev

package main

import (
	"embed"
	"io/fs"
)

//go:embed all:frontend
var embeddedFrontend embed.FS

// frontendFS holds the embedded production frontend assets.
var frontendFS fs.FS = mustSub(embeddedFrontend, "frontend")

func mustSub(f embed.FS, dir string) fs.FS {
	sub, err := fs.Sub(f, dir)
	if err != nil {
		panic(err)
	}
	return sub
}
