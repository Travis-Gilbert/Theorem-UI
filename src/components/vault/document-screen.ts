// SOURCING: React context, so a note's editor knows it is on the document
// screen without a prop through every file handler.
import { createContext } from 'react'

/**
 * True inside the Vault, the document screen: there a note can be asked
 * about at a passage, and the agent's replies and marks show in it. The
 * conversation's dock leaves it false, so /chat's editors stay as they are.
 */
export const DocumentScreen = createContext(false)
