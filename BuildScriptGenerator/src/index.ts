"use strict";

// Modules
const CommandLineArgs = require('command-line-args');
const FS = require('fs');
const Path = require('path');
const YAML = require('js-yaml');

const ansiGreen = '\\033[0;32m';
const ansiRed = '\\033[0;31m';
const ansiColorOff = '\\033[0m';

// Options for running script
const options =
    [
        { name: 'repopath', alias: 'p', type: String },
        { name: 'outputfilename', alias: 'o', type:String }
    ];

// List of commands to ignore, and prevent writing to the final output script
const commandExclusionList =
    [
        'Verify Dependencies can be enumerated',
        'Verify NuGet can be packed',
        'Npm pack',
        'Bump canary package version',
        'Publish final artifacts'
    ];

// List of templates to ignore expanding, and evaluating the commands they contain
const templateExclusionList =
    [
        'templates\\prep-android-nuget.yml'
    ];

function SanitizeCommand(command: string, parameters: object) : string
{
    // Update the working directory environment variable to point to the repo root
    let sanitizedCommand = command.replace(/\$\(System\.DefaultWorkingDirectory\)/g, absoluteRepoPath);

    // Update any parameters with the parameters that were passed in with the template
    const parameterMatches = sanitizedCommand.matchAll(/\$\{\{\s*parameters\.(\S*)\s*\}\}/g);
    for (const match of parameterMatches)
    {
        // The 0th index of match contains the full regex match, wheras the 1st index of match contains the first capture group
        // which in the case of the regex above, is the name of the parameter. We don't have to check that the passed in parameters 
        // object contains a key corresponding to the matched parameter, since we validated this in ProcessTemplate.
        sanitizedCommand = sanitizedCommand.replace(match[0], parameters[match[1]]);
    }

    return sanitizedCommand;
}

// Utility class for managing the script contents in a buffer and writing it to a file
class ScriptWriter
{
    buffer: String;

    constructor()
    {
        this.buffer = '';
    }

    AddComment(comment: string)
    {
        this.buffer += '# ' + comment + '\n'; 
    }

    AddLine(line: string)
    {
        this.buffer +=  line + '\n';
    }

    WriteFile(filename: string)
    {
        FS.writeFileSync(Path.join(args.repopath, filename), this.buffer);
    }
}

function ProcessSteps(steps: Object, parameters: Object) : void
{
    for (const stepIndex in steps)
    {
        const step = steps[stepIndex];
        if ('template' in step)
        {
            if (templateExclusionList.includes(step['template']))
            {
                // This template was explicitly excluded (see the top of the file if you want to include it)
                continue;
            }

            let parameters = {};
            if ('parameters' in step)
            {
                parameters = step['parameters'];
            }

            // Expand the template and process it
            ProcessTemplate(Path.basename(step['template']), parameters);
        }

        if ('inputs' in step && 'script' in step['inputs'])
        {
            const hasDisplayName = 'displayName' in step;
            if (hasDisplayName && commandExclusionList.includes(step['displayName']))
            {
                // This command was explicitly excluded (see the top of the file if you want to include it)
                continue;
            }

            if (hasDisplayName)
            {
                // Add a command to print the name of the task to help identify what task is currently running
                const displayName = step['displayName'];
                scriptWriter.AddComment(`${displayName}`)
                scriptWriter.AddLine(`echo -e \"${ansiGreen}Performing Task: ${displayName}${ansiColorOff}"`);
            }
            else
            {
                scriptWriter.AddComment('Command without a display name');
            }

            const santizedCommand = SanitizeCommand(step['inputs'].script, parameters);
            scriptWriter.AddLine(`echo ${santizedCommand}`);
            scriptWriter.AddLine(santizedCommand);

            // Check the exit code of the command
            scriptWriter.AddLine('if [ $? -ne 0 ]')
            scriptWriter.AddLine('then')
            scriptWriter.AddLine(`\techo -e \"${ansiRed}${santizedCommand}\\nfailed with error code $?. Stopping execution early.${ansiColorOff}\"`);
            scriptWriter.AddLine('\texit $?');
            scriptWriter.AddLine('fi')
            scriptWriter.AddLine('');
        }
    }
}

function ProcessTemplate(templateName: string, passedInParameters: Object) : void
{
    const templateYAML = YAML.load(FS.readFileSync(Path.join(adoYamlTemplatesPath, templateName), 'utf-8'));
    if ('parameters' in templateYAML)
    {
        // Verify the correct parameters were read in
        for (const parameter in templateYAML['parameters'])
        {
            if (!(parameter in passedInParameters))
            {
                throw new Error(`Missing parameter ${parameter} for template ${templateName}`);
            }
        }
    }

    if ('steps' in templateYAML)
    {
        ProcessSteps(templateYAML['steps'], passedInParameters);
    }
}

function ProcessJob(jobYAML: object) : void
{
    // Start the script section with the name of the job, for reference
    if (!('steps' in jobYAML))
    {
        // For whatever reason, this job doesn't have any steps, so ignore it
        return;
    }

    scriptWriter.AddComment('Job: ' + jobYAML['job']);
    scriptWriter.AddLine('');
    ProcessSteps(jobYAML['steps'], {});
}

// Parse the arguments, error out if arguments are invalid
const args = CommandLineArgs(options);

// Ensure the path passed in is an absolute path
const absoluteRepoPath = Path.resolve(args.repopath);
const adoYamlPath = Path.join(absoluteRepoPath, '.ado');
const yamlEntryPath = Path.join(adoYamlPath, 'android-pr.yml');
const adoYamlTemplatesPath = Path.join(adoYamlPath, 'templates');

// Read the entry point file, android-pr.yml, and parse the YAML
const prYAML = YAML.load(FS.readFileSync(yamlEntryPath, 'utf-8'));

// We will write the output contents to a string, and write it to the output file at the end
let scriptWriter = new ScriptWriter();

for (const jobIndex in prYAML.jobs)
{
    ProcessJob(prYAML.jobs[jobIndex]);
}

scriptWriter.WriteFile(args.outputfilename);