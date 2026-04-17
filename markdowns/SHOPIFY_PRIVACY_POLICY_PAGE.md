# Privacy Policy for IMAI.Studio Shopify App

Last updated: April 18, 2026

## Overview

This Privacy Policy explains how the IMAI.Studio Shopify app ("App", "we", "us", or "our") collects, uses, stores, and deletes information when a merchant installs and uses the app with a Shopify store.

The app is designed to help merchants generate product imagery and marketing assets, import approved assets into Shopify, and connect their Shopify store with an IMAI.Studio account.

## Who this policy applies to

This policy applies to merchants who install or use the IMAI.Studio Shopify app and to store data processed through the app.

## Information we collect

When a merchant installs or uses the app, we may collect and process the following categories of information:

### 1. Shopify store information

- store domain
- app installation state
- granted app scopes
- Shopify session records and access tokens required for app authentication and Shopify API access

### 2. Merchant-provided connection data

- the merchant's IMAI.Studio API key, stored in encrypted form
- masked API key data for display inside the app

### 3. App usage and job data

- generation prompts submitted by the merchant
- source image URLs or product URLs submitted by the merchant
- job IDs, job status, timestamps, and generation metadata returned by IMAI.Studio
- imported asset metadata related to Shopify file import flows

### 4. Billing and subscription data

- Shopify app subscription status
- active plan name and billing interval
- billing synchronization state
- credit allocation records used to avoid duplicate credit grants

### 5. Technical and operational data

- server logs
- webhook delivery events
- error logs and diagnostic information required to operate, secure, and troubleshoot the app

## Information we do not intentionally collect

The app is not designed to independently store merchant customer lists, order histories, or payment card data in its own database.

If Shopify sends mandatory privacy compliance webhooks to the app, we process those requests as required by Shopify policy and applicable law.

## How we use information

We use the collected information to:

- authenticate the app with Shopify
- render the embedded Shopify app experience
- let merchants connect their IMAI.Studio account to the app
- send merchant-authorized generation requests to IMAI.Studio
- synchronize Shopify subscription state with IMAI.Studio credit allocation
- import merchant-approved assets into Shopify
- provide support, debugging, fraud prevention, service reliability, and compliance operations

## Shopify token sync to IMAI.Studio

When a merchant connects an IMAI.Studio API key, the app may send the merchant's Shopify store access token and related scope metadata to IMAI.Studio so that IMAI.Studio can perform merchant-authorized Shopify-related operations that support the app's functionality.

This happens only in connection with the merchant's use of the app and connected IMAI.Studio account.

## Legal bases and merchant control

We process store data to provide the services requested by the merchant, to operate the app securely, to comply with Shopify platform requirements, and to meet legal obligations.

Merchants control whether to:

- install the app
- connect an IMAI.Studio API key
- request paid billing plans through Shopify
- remove the app

## Data sharing

We may share data only as needed with the following categories of service providers and platforms:

- Shopify, for app installation, authentication, billing, embedded app operation, and webhooks
- IMAI.Studio, for generation workflows, API key validation, token sync, credits, library access, and billing credit allocation
- AWS or other hosting infrastructure providers used to run the app

We do not sell merchant personal information.

## Data retention

We retain data only for as long as needed to operate the app, provide support, maintain records related to billing and abuse prevention, and comply with legal obligations.

If a merchant uninstalls the app or Shopify sends a `shop/redact` request, we delete shop-scoped data from the app database unless we are legally required to retain specific records.

## Shopify privacy compliance webhooks

As required for public Shopify apps, the app responds to Shopify compliance webhooks, including:

- `customers/data_request`
- `customers/redact`
- `shop/redact`

Where applicable, we process and complete these requests within the time required by Shopify and applicable law.

## Security

We use reasonable administrative, technical, and organizational safeguards to protect data, including encrypted storage of the merchant's IMAI.Studio API key and HTTPS in production.

No method of transmission or storage is perfectly secure, so we cannot guarantee absolute security.

## International processing

Data may be processed in countries where our service providers or infrastructure operate. By using the app, merchants understand that data may be transferred and processed outside their home jurisdiction, subject to applicable safeguards.

## Changes to this policy

We may update this Privacy Policy from time to time. When we do, we will update the "Last updated" date on this page.

## Contact

If you have questions about this Privacy Policy or the app's data practices, contact:

- Email: tech@imai.studio
- Website: https://www.imai.studio

