// Read-only: what the Editor holds unsaved, for studio-editor-check.ps1 (unity command script eval --file).
// A statement block ending in return, with no using lines, as script eval wants (Unity-CLI.md).
var dirtyScenes = new System.Collections.Generic.List<string>();
for (int i = 0; i < UnityEngine.SceneManagement.SceneManager.sceneCount; i++)
{
    var scene = UnityEngine.SceneManagement.SceneManager.GetSceneAt(i);
    if (scene.isDirty)
    {
        dirtyScenes.Add(string.IsNullOrEmpty(scene.path) ? scene.name + " (never saved)" : scene.path);
    }
}

var stage = UnityEditor.SceneManagement.PrefabStageUtility.GetCurrentPrefabStage();
string openPrefab = "";
bool openPrefabDirty = false;
if (stage != null)
{
    openPrefab = stage.assetPath;
    openPrefabDirty = stage.scene.isDirty;
}

var text = new System.Text.StringBuilder();
text.Append("{\"dirtyScenes\":[");
for (int i = 0; i < dirtyScenes.Count; i++)
{
    if (i > 0) text.Append(",");
    text.Append("\"").Append(dirtyScenes[i].Replace("\\", "/").Replace("\"", "'")).Append("\"");
}
text.Append("],\"openPrefab\":\"").Append(openPrefab.Replace("\\", "/")).Append("\"");
text.Append(",\"openPrefabDirty\":").Append(openPrefabDirty ? "true" : "false");
text.Append(",\"recoveryFolder\":").Append(UnityEditor.AssetDatabase.IsValidFolder("Assets/_Recovery") ? "true" : "false");
text.Append("}");
return text.ToString();
