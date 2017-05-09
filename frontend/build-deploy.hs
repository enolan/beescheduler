#!/usr/bin/env stack
-- stack --resolver lts-8.13 script
{-# LANGUAGE QuasiQuotes #-}
import Control.Monad
import Path
import Path.IO
import System.Process.Typed

main = do
  runProcess $ shell "npm run build"
  runProcess $ shell "gzip -9 -r build"
  (_dirs, files) <- listDirRecur [reldir|build|]
  forM_ files $ \path -> do
    newPath <- setFileExtension "" path
    renameFile path newPath
  runProcess $ shell "aws s3 sync --acl public-read --content-encoding gzip build s3://beescheduler"
