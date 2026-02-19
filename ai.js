export async function requestAIDebrief(sessionData) {
    try {
        const response = await fetch("/api/debrief", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sessionData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            return errorData.text || "Medical server error.";
        }

        const data = await response.json();
        return data.text || "Analysis complete.";
    } catch (err) {
        console.error("Fetch error:", err);
        return "Connection lost. Reviewing local logs.";
    }
}