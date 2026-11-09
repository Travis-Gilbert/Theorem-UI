// SOURCING: none — reads the frame's own URL.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Docked in the Theorem UI's page (`?layout=embedded`, `EMBEDDED_LAYOUT` in theorem-workspace's
 * common/ide-bridge.ts). The page has the project, the file tree and the status bar, so the frame
 * keeps its editors and bottom panel: no title bar, no status bar of its own, and the explorer's
 * side panel starts closed.
 */
export const EMBEDDED = new URLSearchParams(window.location.search).get('layout') === 'embedded';
