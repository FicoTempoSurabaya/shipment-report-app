# login-suspense-fix-v1

Fix build error:

`useSearchParams() should be wrapped in a suspense boundary at page "/login"`

Replace:

`src/app/(auth)/login/page.tsx`

Then run:

```bash
npm run build
```
