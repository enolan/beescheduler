#!/usr/bin/env stack
-- stack --resolver lts-8.13 script --nix --nix-packages zlib --no-nix-pure
{-# LANGUAGE BangPatterns, QuasiQuotes #-}
import Control.Concurrent
import Control.Monad
import Data.Semigroup
import Path
import Path.IO
import System.Environment
import System.Process.Typed
import Text.Regex.TDFA
import Text.Regex.TDFA.ByteString.Lazy

invalidatedFiles = map ('/' : ) ["asset-manifest.json", "favicon.ico", "index.html"]

main = do
  Just _ <- lookupEnv "REACT_APP_SLS_BASEURL"
  Just stage <- lookupEnv "STAGE"
  let !cfDistId = case stage of
        "dev" -> "E1DE61SPYQLKWP"
        "prod" -> "E1LN8878LCOJU"
        _other -> error "stage set to bad value"
  runProcess $ shell "npm run build"
  runProcess $ shell $
    "aws s3 sync --delete build s3://beescheduler-" <> stage <> "-cf-origin"
  runProcess $ proc "aws" $
    ["cloudfront", "create-invalidation", "--distribution-id", cfDistId,
     "--paths"] ++ invalidatedFiles
  waitLoop cfDistId

waitLoop cfDistId = do
  (stdout, _stderr) <- readProcess_ $ shell $
    "aws cloudfront list-invalidations --distribution-id " <> cfDistId
  if stdout =~ "InProgress"
    then do putStrLn "Still invalidating"
            threadDelay 5000000
            waitLoop cfDistId
    else do putStrLn "Done invaliating"
