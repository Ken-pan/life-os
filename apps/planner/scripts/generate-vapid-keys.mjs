#!/usr/bin/env node
import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()
console.log('Add these to Netlify (planner site) and local .env:')
console.log('')
console.log(`PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`)
console.log('VAPID_SUBJECT=mailto:hello@kenos.space')
console.log('')
console.log('Also apply migration: apps/planner/supabase/migrations/20260709120000_planner_push_subscriptions.sql')
