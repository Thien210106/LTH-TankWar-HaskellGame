{-# LANGUAGE ForeignFunctionInterface #-}

module Sound
  ( triggerSound
  ) where

import Control.Concurrent (forkIO, myThreadId)
import Control.Monad (void)
import Data.Char (isDigit)
import Foreign.C.String (CString, withCString)
import Foreign.C.Types (CChar(..), CUInt(..))
import Foreign.Ptr (Ptr, nullPtr)

import Assets
import Types

foreign import ccall unsafe "mciSendStringA"
  mciSendString :: CString -> Ptr CChar -> CUInt -> Ptr () -> IO CUInt

triggerSound :: SoundAssets -> SoundEffect -> IO ()
triggerSound sounds effect = void (forkIO (playSoundFile effect (soundPath sounds effect)))

playSoundFile :: SoundEffect -> FilePath -> IO ()
playSoundFile effect path
  | isBackgroundMusic effect = do
      sendMci "close tankwarBgm"
      sendMci ("open \"" <> path <> "\" type mpegvideo alias tankwarBgm")
      sendMci "play tankwarBgm repeat"
  | otherwise = do
      threadId <- myThreadId
      let alias = "tankwar" <> filter isDigit (show threadId)
      sendMci ("open \"" <> path <> "\" type mpegvideo alias " <> alias)
      sendMci ("play " <> alias)

isBackgroundMusic :: SoundEffect -> Bool
isBackgroundMusic effect = case effect of
  MenuMusic -> True
  InGameMusic -> True
  EndScreenMusic -> True
  _ -> False

sendMci :: String -> IO ()
sendMci command = withCString command (\value -> void (mciSendString value nullPtr 0 nullPtr))
