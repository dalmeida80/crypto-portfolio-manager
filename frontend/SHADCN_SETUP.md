# shadcn/ui Setup Guide

## ✅ What's Been Set Up

This branch includes a complete setup of **shadcn/ui** with **Tailwind CSS v3** and **Dark Mode** support.

### Installed Dependencies

```json
"dependencies": {
  "class-variance-authority": "^0.7.0",
  "clsx": "^2.1.0",
  "tailwind-merge": "^2.2.0",
  "@radix-ui/react-slot": "^1.0.2",
  "lucide-react": "^0.344.0"
},
"devDependencies": {
  "@types/node": "^20.11.5",
  "tailwindcss": "^3.4.0",
  "postcss": "^8.4.35",
  "autoprefixer": "^10.4.17"
}
```

### Configuration Files Created

- ✅ `tailwind.config.js` - Tailwind configuration with shadcn/ui theme
- ✅ `postcss.config.js` - PostCSS configuration
- ✅ `components.json` - shadcn/ui CLI configuration
- ✅ `tsconfig.app.json` - Updated with path aliases (`@/*`)
- ✅ `vite.config.ts` - Updated with path resolution
- ✅ `src/index.css` - Tailwind directives and CSS variables for dark mode

### Components Added

- ✅ `Button` - Multiple variants (default, secondary, destructive, outline, ghost, link)
- ✅ `Card` - With Header, Title, Description, Content, Footer
- ✅ `Badge` - Status badges with variants
- ✅ `Input` - Form input component

### Features Implemented

- ✅ **Dark Mode** - Full dark/light theme toggle with localStorage persistence
- ✅ **ThemeContext** - React context for theme management
- ✅ **ThemeToggle** - Button component to switch themes
- ✅ **Test Page** - `/test-shadcn` route to preview all components

---

## 🚀 How to Use After Merge

### 1. Install Dependencies

After pulling this branch:

```bash
cd ~/workspace/crypto-portfolio-manager/frontend
npm install
```

### 2. Test Locally

```bash
npm run dev
```

Visit the test page at: `http://localhost:3000/test-shadcn`

### 3. Deploy to Production

```bash
cd ~/workspace/crypto-portfolio-manager
git pull origin main
docker compose down
docker compose build --no-cache frontend
docker compose up -d
```

---

## 📚 Using Components in Your Code

### Import Components

```typescript
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
```

### Example: Button Usage

```tsx
<Button>Click me</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
```

### Example: Card Usage

```tsx
<Card>
  <CardHeader>
    <CardTitle>Portfolio Name</CardTitle>
    <CardDescription>Portfolio description</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Your content here</p>
  </CardContent>
</Card>
```

### Example: Badge Usage

```tsx
<Badge>Active</Badge>
<Badge variant="secondary">Pending</Badge>
<Badge variant="destructive">Error</Badge>
<Badge variant="outline">Draft</Badge>
```

### Example: Dark Mode Toggle

```tsx
import { ThemeToggle } from '@/components/ThemeToggle'

// Add to your navbar or header
<ThemeToggle />
```

---

## 🎨 Adding More Components

The shadcn/ui CLI is configured. To add more components:

```bash
cd frontend

# Add specific components
npx shadcn@latest add table
npx shadcn@latest add dialog
npx shadcn@latest add dropdown-menu
npx shadcn@latest add tabs
npx shadcn@latest add sheet

# See all available components
npx shadcn@latest add
```

---

## 🎯 Next Steps

1. **Migrate existing pages** to use shadcn/ui components
2. **Add charts** with Recharts library
3. **Improve responsive design** with Tailwind breakpoints
4. **Add animations** with Framer Motion (optional)

---

## 📖 Resources

- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Radix UI Primitives](https://www.radix-ui.com)
- [Lucide Icons](https://lucide.dev)

---

## 🐛 Troubleshooting

### Issue: "Cannot find module '@/...'"  
**Solution:** Make sure you ran `npm install` after pulling the changes.

### Issue: Tailwind classes not working  
**Solution:** Rebuild the Docker container with `--no-cache` flag.

### Issue: Dark mode not persisting  
**Solution:** Check browser localStorage for `theme` key.

---

## ✨ Example Screenshots

After deployment, visit `/test-shadcn` to see:

- ✅ All button variants
- ✅ Badge styles
- ✅ Card layouts
- ✅ Form inputs
- ✅ Dark/Light mode toggle
- ✅ Color palette

---

**Ready to merge!** 🚀
