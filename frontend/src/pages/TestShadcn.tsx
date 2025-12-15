import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ThemeToggle } from "@/components/ThemeToggle"

export const TestShadcn = () => {
  return (
    <div className="container mx-auto p-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-bold">shadcn/ui Test Page</h1>
        <ThemeToggle />
      </div>
      
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Buttons</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Badges</h2>
        <div className="flex gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Cards</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Card Title</CardTitle>
              <CardDescription>This is a card description</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Card content goes here. This is a test of the shadcn/ui Card component.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Portfolio Stats</CardTitle>
              <CardDescription>Example portfolio card</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Value</span>
                  <span className="font-semibold">$10,500.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Profit/Loss</span>
                  <span className="font-semibold text-green-600">+$1,250.00</span>
                </div>
                <Badge className="mt-2">Active</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dark Mode Test</CardTitle>
              <CardDescription>Toggle theme to test</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">Click the moon/sun icon in the top right to toggle between light and dark themes.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Form Inputs</h2>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Example Form</CardTitle>
            <CardDescription>Input components with shadcn/ui styling</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input type="email" placeholder="Enter your email" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input type="password" placeholder="Enter your password" />
            </div>
            <Button className="w-full">Submit</Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Color Palette</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="h-20 bg-primary rounded-md mb-2"></div>
              <p className="text-sm font-medium">Primary</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="h-20 bg-secondary rounded-md mb-2"></div>
              <p className="text-sm font-medium">Secondary</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="h-20 bg-destructive rounded-md mb-2"></div>
              <p className="text-sm font-medium">Destructive</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="h-20 bg-muted rounded-md mb-2"></div>
              <p className="text-sm font-medium">Muted</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
